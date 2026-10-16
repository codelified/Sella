import { cleanCode } from "../lib/coupons.js";
import type { PluginRoute } from "emdash";

/** Admin coupon CRUD. All private — called from the Coupons admin page. */

export const couponListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const page = await ctx.storage.coupons.query({ limit: 100 });
		return {
			items: page.items.map((i: any) => ({
				code: i.data.code,
				kind: i.data.kind,
				value: i.data.value,
				minSubtotal: i.data.minSubtotal ?? 0,
				maxUses: i.data.maxUses ?? null,
				usedCount: i.data.usedCount ?? 0,
				active: i.data.active !== false,
				expiresAt: i.data.expiresAt ?? null,
			})),
		};
	},
};

export const couponUpsertRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const code = cleanCode(body.code);
		const kind = body.kind === "fixed" ? "fixed" : "percent";
		const value = Number(body.value);
		if (!code) return { error: { code: "NO_CODE", message: "Coupon code required." } };
		if (!Number.isFinite(value) || value <= 0) {
			return { error: { code: "BAD_VALUE", message: "Value must be a positive number." } };
		}
		if (kind === "percent" && value > 100) {
			return { error: { code: "BAD_VALUE", message: "Percent off cannot exceed 100." } };
		}
		const existing = (await ctx.storage.coupons.get(code)) as any;
		const scope = body.scope === "automatic" ? "automatic" : "code";
		const rule = body.rule === "bxgy" ? "bxgy" : "cart";
		const record = {
			code,
			kind,
			value,
			minSubtotal: Math.max(0, Number(body.minSubtotal) || 0),
			...(body.maxUses === null || body.maxUses === undefined || body.maxUses === ""
				? {}
				: { maxUses: Math.max(1, Math.floor(Number(body.maxUses))) }),
			usedCount: typeof existing?.usedCount === "number" ? existing.usedCount : 0,
			active: body.active !== false,
			expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
			scope,
			rule,
			...(rule === "bxgy"
				? {
						buyQty: Math.max(1, Math.floor(Number(body.buyQty) || 1)),
						getQty: Math.max(1, Math.floor(Number(body.getQty) || 1)),
						...(body.productSlug ? { productSlug: String(body.productSlug).toLowerCase().slice(0, 120) } : {}),
					}
				: {}),
		};
		await ctx.storage.coupons.put(code, record);
		return { ok: true, coupon: record };
	},
};

export const couponDeleteRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const code = cleanCode(body.code);
		if (!code) return { error: { code: "NO_CODE", message: "Coupon code required." } };
		return { ok: await ctx.storage.coupons.delete(code) };
	},
};
