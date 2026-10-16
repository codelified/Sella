import { money } from "../lib/money.js";
import type { PluginRoute } from "emdash";

/** Store overview for the Reports page + dashboard widgets. Single route, one round of reads. */
export const reportSummaryRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const byStatus: Record<string, number> = {};
		let revenue = 0;
		const productQty: Record<string, { name: string; qty: number; revenue: number }> = {};
		const recent: any[] = [];
		let cursor: string | undefined;
		let pages = 0;
		do {
			const page = await ctx.storage.orders.query({ limit: 100, cursor });
			for (const item of page.items as any[]) {
				const o = item.data;
				byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
				if (o.status === "paid" || o.status === "fulfilled") {
					// Revenue normalized to USD (orders store usdTotal since Phase 7).
					revenue += Number(o.usdTotal ?? o.total) || 0;
				}
				for (const line of Array.isArray(o.items) ? o.items : []) {
					const key = String(line.slug ?? line.name);
					const slot = productQty[key] ?? { name: String(line.name ?? key), qty: 0, revenue: 0 };
					slot.qty += Number(line.qty) || 0;
					slot.revenue += (Number(line.price) || 0) * (Number(line.qty) || 0);
					productQty[key] = slot;
				}
				if (recent.length < 5) {
					recent.push({
						number: o.number,
						email: o.email,
						status: o.status,
						total: Number(o.total),
						totalLabel: money(Number(o.total)),
						createdAt: o.createdAt,
					});
				}
			}
			cursor = page.hasMore ? page.cursor : undefined;
			pages++;
		} while (cursor && pages < 10);

		const topProducts = Object.values(productQty)
			.sort((a, b) => b.qty - a.qty)
			.slice(0, 5);

		let lowStock = 0;
		try {
			const inv = await ctx.storage.inventory.query({ limit: 100 });
			for (const i of inv.items as any[]) {
				if (typeof i.data?.stock === "number" && typeof i.data?.lowAt === "number" && i.data.stock <= i.data.lowAt) {
					lowStock++;
				}
			}
		} catch {
			/* inventory unavailable */
		}

		let pendingReviews = 0;
		try {
			pendingReviews = await ctx.storage.reviews.count({ status: "draft" });
		} catch {
			/* reviews unavailable */
		}

		return {
			ordersByStatus: byStatus,
			revenue: Math.round(revenue * 100) / 100,
			revenueLabel: money(revenue),
			topProducts,
			lowStock,
			pendingReviews,
			recent,
		};
	},
};
