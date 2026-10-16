import { money } from "../lib/money.js";
import { sendFulfillmentNotice, sendRefundNotice } from "../lib/mailer.js";
import { getProvider } from "../lib/registry.js";
import type { PluginRoute } from "emdash";

function publicOrder(o: any) {
	const items = Array.isArray(o?.items) ? o.items : [];
	return {
		number: o.number,
		email: o.email,
		name: o.name,
		status: o.status,
		provider: o.provider,
		total: Number(o.total),
		totalLabel: money(Number(o.total)),
		itemCount: items.reduce((n: number, i: any) => n + (Number(i.qty) || 0), 0),
		couponCode: o.couponCode ?? "",
		createdAt: o.createdAt,
		updatedAt: o.updatedAt,
	};
}

export const orderListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const where: Record<string, unknown> = {};
		if (q.status) where.status = String(q.status);
		const page = await ctx.storage.orders.query({
			where,
			limit: Math.min(100, Number(q.limit) || 25),
			cursor: q.cursor,
		});
		return {
			items: page.items.map((i: any) => publicOrder(i.data)),
			cursor: page.cursor ?? null,
			hasMore: page.hasMore,
		};
	},
};

export const orderDetailRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const number = String(q.number ?? "").slice(0, 40);
		if (!number) return { error: { code: "NO_NUMBER", message: "Missing order number." } };
		const row = (await ctx.storage.orders.get(number)) as any;
		if (!row) return { found: false };
		return { found: true, order: row };
	},
};

export const orderRefundRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const number = String(body.number ?? "").slice(0, 40);
		const amount = body.amount === undefined ? null : Number(body.amount);
		if (!number) return { error: { code: "NO_NUMBER", message: "Missing order number." } };
		const current = await ctx.storage.orders.getVersioned(number);
		if (!current) return { error: { code: "NOT_FOUND", message: "Unknown order." } };
		const order = current.value as any;
		if (order.status === "refunded") return { ok: true, status: "refunded", duplicate: true };
		if (order.status !== "paid" && order.status !== "fulfilled") {
			return { error: { code: "BAD_STATUS", message: `Only paid orders can be refunded (status: ${order.status}).` } };
		}
		if (!order.paymentRef) {
			return { error: { code: "NO_PAYMENT", message: "No provider payment to refund (manual order?). Mark refunded via status change." } };
		}
		const provider = getProvider(order.provider ?? "stripe");
		if (!provider) return { error: { code: "BAD_PROVIDER", message: "Unknown provider." } };
		try {
			await provider.refund(order.paymentRef, amount, { settings: ctx.settings, http: ctx.http }, String(order.currency ?? "USD"));
		} catch (err) {
			return { error: { code: "REFUND_FAILED", message: err instanceof Error ? err.message : "Refund failed." } };
		}
		const res = await ctx.storage.orders.compareAndSet(number, current.revision, {
			...order,
			status: "refunded",
			adminNotes: "Refunded via provider. Stock was NOT auto-restocked — adjust manually.",
			updatedAt: new Date().toISOString(),
		});
		if (!res.applied) return { error: { code: "CONFLICT", message: "Order changed — reload and retry." } };
		const items = Array.isArray(order.items) ? order.items : [];
		await sendRefundNotice(ctx, {
			number: order.number,
			email: order.email,
			name: order.name,
			items: items.map((i: any) => ({ name: String(i?.name ?? ""), qty: Number(i?.qty) || 0, price: Number(i?.price) || 0 })),
			total: Number(order.total) || 0,
			amount,
		}).catch(() => null);
		return { ok: true, status: "refunded" };
	},
};

export const orderSetStatusRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const number = String(body.number ?? "").slice(0, 40);
		const status = String(body.status ?? "");
		const allowed = ["pending", "paid", "partially_fulfilled", "fulfilled", "cancelled"];
		if (!number || !allowed.includes(status)) {
			return { error: { code: "BAD_INPUT", message: "Need order number + one of: " + allowed.join(", ") } };
		}
		const current = await ctx.storage.orders.getVersioned(number);
		if (!current) return { error: { code: "NOT_FOUND", message: "Unknown order." } };
		const res = await ctx.storage.orders.compareAndSet(number, current.revision, {
			...current.value,
			status,
			updatedAt: new Date().toISOString(),
		});
		if (!res.applied) return { error: { code: "CONFLICT", message: "Order changed — reload and retry." } };
		if (status === "fulfilled") {
			const o = current.value as any;
			const items = Array.isArray(o.items) ? o.items : [];
			await sendFulfillmentNotice(ctx, {
				number: o.number,
				email: o.email,
				name: o.name,
				items: items.map((i: any) => ({ name: String(i?.name ?? ""), qty: Number(i?.qty) || 0, price: Number(i?.price) || 0 })),
				total: Number(o.total) || 0,
			}).catch(() => null);
		}
		return { ok: true, status };
	},
};
