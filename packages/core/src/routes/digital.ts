import { isDigital, issueGrant, redeemGrant } from "../lib/digital.js";
import type { PluginRoute } from "emdash";

export const digitalLinkRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const slug = String(body.slug ?? "").toLowerCase().trim().slice(0, 120);
		const url = String(body.url ?? "").trim().slice(0, 2000);
		if (!slug || !/^https?:\/\//.test(url)) {
			return { error: { code: "BAD_INPUT", message: "Need product slug + https file URL." } };
		}
		if (body.remove === true) {
			return { ok: await ctx.storage.digital.delete(`digital:${slug}`) };
		}
		const link = {
			slug,
			url,
			maxDownloads: Math.max(1, Math.floor(Number(body.maxDownloads) || 5)),
			expiryDays: Math.max(1, Math.floor(Number(body.expiryDays) || 30)),
			updatedAt: new Date().toISOString(),
		};
		await ctx.storage.digital.put(`digital:${slug}`, link);
		return { ok: true, link };
	},
};

export const digitalListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const page = await ctx.storage.digital.query({ limit: 100 });
		return { items: page.items.map((i: any) => i.data) };
	},
};

export const downloadServeRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const res = await redeemGrant(ctx.storage, String(q.token ?? ""));
		if (!res.ok) return { error: { code: "DENIED", message: res.reason } };
		// NOTE: plugin JSON routes cannot 302. The storefront thank-you page
		// and order emails link here; the response carries the file URL and the
		// caller redirects. (Raw redirect support is roadmap.)
		return { ok: true, url: res.url };
	},
};

export const downloadForOrderRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const sessionId = String(body.sessionId ?? body.session_id ?? "").slice(0, 200);
		if (!sessionId) return { error: { code: "NO_SESSION", message: "Missing session." } };
		const found = await ctx.storage.orders.query({ where: { providerRef: sessionId }, limit: 1 });
		const order = found.items[0]?.data as any;
		if (!order || (order.status !== "paid" && order.status !== "fulfilled")) {
			return { found: false };
		}
		const grants: Array<{ productSlug: string; name: string; token: string; expiresAt: string; remaining: number }> = [];
		const page = await ctx.storage.downloads.query({ limit: 200 });
		for (const row of page.items as any[]) {
			const g = row.data;
			if (g?.orderNumber !== order.number) continue;
			const remaining = Math.max(0, (g.maxDownloads ?? 0) - (g.usedCount ?? 0));
			const expired = new Date(g.expiresAt ?? 0).getTime() < Date.now();
			grants.push({
				productSlug: g.slug,
				name: String((Array.isArray(order.items) ? order.items : []).find((i: any) => i.slug === g.slug)?.name ?? g.slug),
				token: expired || remaining <= 0 ? "" : row.id,
				expiresAt: g.expiresAt,
				remaining,
			});
		}
		return { found: true, orderNumber: order.number, grants };
	},
};
