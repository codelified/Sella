import type { PluginRoute } from "emdash";
/**
 * Partial fulfillment: fulfill line items in parts. The order auto-transitions
 * paid → partially_fulfilled → fulfilled as lines complete.
 */
export const orderFulfillItemRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const number = String(body.number ?? "").slice(0, 40);
		const slug = String(body.slug ?? "").slice(0, 120);
		const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
		if (!number || !slug) {
			return { error: { code: "BAD_INPUT", message: "Need order number + item slug." } };
		}
		const current = await ctx.storage.orders.getVersioned(number);
		if (!current) return { error: { code: "NOT_FOUND", message: "Unknown order." } };
		const order = current.value as any;
		if (order.status !== "paid" && order.status !== "partially_fulfilled") {
			return { error: { code: "BAD_STATUS", message: `Cannot fulfil a ${order.status} order.` } };
		}
		const items = Array.isArray(order.items) ? order.items.map((i: any) => ({ ...i })) : [];
		const line = items.find((i: any) => String(i?.slug ?? "") === slug);
		if (!line) return { error: { code: "NO_LINE", message: "Item not on this order." } };
		const already = Math.max(0, Math.floor(Number(line.fulfilledQty) || 0));
		const remaining = (Number(line.qty) || 0) - already;
		if (remaining <= 0) return { error: { code: "COMPLETE", message: "Line already fully fulfilled." } };
		line.fulfilledQty = already + Math.min(qty, remaining);
		const complete = items.every(
			(i: any) => Math.max(0, Math.floor(Number(i.fulfilledQty) || 0)) >= (Number(i.qty) || 0),
		);
		const res = await ctx.storage.orders.compareAndSet(number, current.revision, {
			...order,
			items,
			status: complete ? "fulfilled" : "partially_fulfilled",
			updatedAt: new Date().toISOString(),
		});
		if (!res.applied) return { error: { code: "CONFLICT", message: "Order changed — reload and retry." } };
		return { ok: true, status: complete ? "fulfilled" : "partially_fulfilled", line: { slug, fulfilledQty: line.fulfilledQty, qty: line.qty } };
	},
};
