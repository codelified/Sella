import { adjustStock, decrementStock, getLowStock } from "../lib/inventory.js";
import type { PluginRoute } from "emdash";

async function readProducts(ctx: any): Promise<Array<{ slug: string; stock: number }>> {
	const page = await ctx.content.list("products", { limit: 100 });
	const items = (page?.items ?? page?.data?.items ?? []) as any[];
	return items
		.filter((e) => (e?.status ?? "published") === "published")
		.map((e) => ({
			slug: String(e?.slug ?? e?.id ?? ""),
			stock: typeof e?.data?.stock === "number" ? e.data.stock : 0,
		}))
		.filter((p) => p.slug);
}

export const inventoryListRoute: PluginRoute = {
	permission: "plugins:read",
	handler: async (ctx: any) => {
		const page = await ctx.storage.inventory.query({ orderBy: { stock: "asc" }, limit: 100 });
		return { items: page.items.map((i: any) => i.data) };
	},
};

export const inventoryLowStockRoute: PluginRoute = {
	permission: "plugins:read",
	handler: async (ctx: any) => {
		return { items: await getLowStock(ctx.storage.inventory, 50) };
	},
};

export const inventoryAdjustRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as { slug?: unknown; stock?: unknown; lowAt?: unknown };
		const record = await adjustStock(
			ctx.storage.inventory,
			String(body.slug ?? ""),
			Number(body.stock),
			body.lowAt === undefined ? 15 : Number(body.lowAt),
		);
		return { record };
	},
};

/** One-way sync: CMS product stock → plugin inventory (setup / bulk-edit recovery). */
export const inventorySyncRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const products = await readProducts(ctx);
		const now = new Date().toISOString();
		let synced = 0;
		for (const p of products) {
			const existing = (await ctx.storage.inventory.get(p.slug)) as any;
			await ctx.storage.inventory.put(p.slug, {
				slug: p.slug,
				stock: p.stock,
				lowAt: typeof existing?.lowAt === "number" ? existing.lowAt : 15,
				updatedAt: now,
			});
			synced++;
		}
		return { synced };
	},
};

export const inventoryDecrementRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as { slug?: unknown; qty?: unknown };
		return decrementStock(ctx.storage.inventory, String(body.slug ?? ""), body.qty);
	},
};
