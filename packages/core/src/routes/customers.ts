import { maskEmail } from "../lib/pricing.js";
import type { PluginRoute } from "emdash";

export const customerLookupRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const email = String(body.email ?? "").toLowerCase().trim().slice(0, 160);
		const orderNumber = String(body.orderNumber ?? body.number ?? "").slice(0, 40);
		if (!email.includes("@") || !orderNumber) {
			return { error: { code: "BAD_INPUT", message: "Email and order number required." } };
		}
		// Ownership proof = knowing BOTH the email and the order number.
		const found = await ctx.storage.orders.query({ where: { number: orderNumber }, limit: 1 });
		const order = found.items[0]?.data as any;
		if (!order || String(order.email ?? "").toLowerCase() !== email) {
			return { found: false };
		}
		const items = Array.isArray(order.items) ? order.items : [];
		return {
			found: true,
			orderNumber: order.number,
			status: order.status,
			total: Number(order.total),
			itemCount: items.reduce((n: number, i: any) => n + (Number(i.qty) || 0), 0),
			email: maskEmail(email),
		};
	},
};

export const customerListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const page = await ctx.storage.customers.query({
			limit: Math.min(100, Number(q.limit) || 50),
			cursor: q.cursor,
		});
		return {
			items: page.items.map((i: any) => ({
				email: i.data.email,
				name: i.data.name,
				orderCount: i.data.orderCount ?? 0,
				totalSpent: i.data.totalSpent ?? 0,
			})),
			cursor: page.cursor ?? null,
			hasMore: page.hasMore,
		};
	},
};

export const customerDetailRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const email = String(q.email ?? "").toLowerCase().trim().slice(0, 160);
		if (!email.includes("@")) return { error: { code: "BAD_INPUT", message: "Missing email." } };
		const row = (await ctx.storage.customers.get(email)) as any;
		if (!row) return { found: false };
		return { found: true, customer: row };
	},
};
