import { getProvider } from "../lib/registry.js";
import type { PluginRoute } from "emdash";

export interface PlanRecord {
	slug: string;
	interval: "month" | "year";
	intervalCount: number;
	trialDays: number;
	updatedAt: string;
}

export const planLinkRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const slug = String(body.slug ?? "").toLowerCase().trim().slice(0, 120);
		if (body.remove === true) {
			if (!slug) return { error: { code: "NO_SLUG", message: "Missing slug." } };
			return { ok: await ctx.storage.plans.delete(`plan:${slug}`) };
		}
		const interval = body.interval === "year" ? "year" : "month";
		if (!slug) return { error: { code: "NO_SLUG", message: "Missing slug." } };
		const plan: PlanRecord = {
			slug,
			interval,
			intervalCount: Math.max(1, Math.floor(Number(body.intervalCount) || 1)),
			trialDays: Math.max(0, Math.floor(Number(body.trialDays) || 0)),
			updatedAt: new Date().toISOString(),
		};
		await ctx.storage.plans.put(`plan:${slug}`, plan);
		return { ok: true, plan };
	},
};

export const planListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const page = await ctx.storage.plans.query({ limit: 100 });
		return { items: page.items.map((i: any) => i.data) };
	},
};

export const subscriptionListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const where: Record<string, unknown> = {};
		if (q.status) where.status = String(q.status);
		if (q.email) where.email = String(q.email).toLowerCase();
		const page = await ctx.storage.subscriptions.query({ where, limit: 100 });
		return {
			items: page.items.map((i: any) => ({
				id: i.id,
				email: i.data.email,
				slug: i.data.slug,
				status: i.data.status,
				renewals: (i.data.renewals ?? []).length,
				currentPeriodEnd: i.data.currentPeriodEnd,
			})),
		};
	},
};

export const subscriptionPortalRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const customerRef = String(body.customerRef ?? body.email ?? "");
		if (!customerRef) return { error: { code: "NO_CUSTOMER", message: "Need customerRef (Stripe customer id) or email." } };
		const provider = getProvider("stripe");
		if (!provider?.portal) {
			return { error: { code: "NO_PORTAL", message: "Portal not supported." } };
		}
		try {
			const portal = await provider.portal(customerRef, { settings: ctx.settings, http: ctx.http });
			return { url: portal.url };
		} catch (err) {
			return { error: { code: "PORTAL_FAILED", message: err instanceof Error ? err.message : "Portal failed." } };
		}
	},
};
