import type { PluginRoute } from "emdash";
/** Demo seed: the 4 template coupons (preserving live usedCount) + inventory sync. */
const DEMO_COUPONS = [
	{
		code: "WELCOME10",
		kind: "percent",
		value: 10,
		minSubtotal: 0,
		maxUses: 1000,
		active: true,
		expiresAt: "2027-12-31T23:59:59.000Z",
	},
	{
		code: "TRAIL20",
		kind: "fixed",
		value: 20,
		minSubtotal: 100,
		active: true,
		expiresAt: "2027-06-30T23:59:59.000Z",
	},
	{
		code: "OLD20",
		kind: "percent",
		value: 20,
		active: true,
		expiresAt: "2025-01-01T00:00:00.000Z",
	},
	{
		code: "ONCE25",
		kind: "percent",
		value: 25,
		active: true,
		maxUses: 1,
		expiresAt: "2027-12-31T23:59:59.000Z",
	},
];

export const seedDemoRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		let coupons = 0;
		for (const c of DEMO_COUPONS) {
			const existing = (await ctx.storage.coupons.get(c.code)) as any;
			await ctx.storage.coupons.put(c.code, {
				...c,
				usedCount: typeof existing?.usedCount === "number" ? existing.usedCount : 0,
			});
			coupons++;
		}
		const page = await ctx.content.list("products", { limit: 100 });
		const items = (page?.items ?? []) as any[];
		const now = new Date().toISOString();
		let inventory = 0;
		for (const e of items) {
			if ((e?.status ?? "published") !== "published") continue;
			const slug = String(e?.slug ?? "");
			if (!slug) continue;
			const existing = (await ctx.storage.inventory.get(slug)) as any;
			await ctx.storage.inventory.put(slug, {
				slug,
				stock: typeof e?.data?.stock === "number" ? e.data.stock : 0,
				lowAt: typeof existing?.lowAt === "number" ? existing.lowAt : 15,
				updatedAt: now,
			});
			inventory++;
		}
		return { coupons, inventory };
	},
};
