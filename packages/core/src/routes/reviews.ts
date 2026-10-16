import { hasVerifiedPurchase, reviewId, summarize, validateReview } from "../lib/reviews.js";
import type { PluginRoute } from "emdash";

async function productExists(ctx: any, slug: string): Promise<boolean> {
	try {
		const page = await ctx.content.list("products", { limit: 100 });
		const items = (page?.items ?? []) as any[];
		return items.some((e) => String(e?.slug ?? "") === slug && (e?.status ?? "published") === "published");
	} catch {
		return false;
	}
}

export const reviewSubmitRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const checked = validateReview(((ctx.input ?? {}) as any) ?? {});
		if (!checked.ok) {
			if (checked.code === "SPAM") return { received: true }; // honeypot: fake success
			return { error: { code: checked.code, message: checked.message } };
		}
		if (!(await productExists(ctx, checked.value.productSlug))) {
			return { error: { code: "NO_PRODUCT", message: "Unknown product." } };
		}
		let moderate = true;
		try {
			const v = await ctx.settings.get("reviewsRequireModeration");
			moderate = v !== false && v !== "false" && v !== 0;
		} catch {
			/* default true */
		}
		const id = reviewId(checked.value.productSlug);
		// Optional verified-buyer gate (setting reviewsRequirePurchase).
		let gated = false;
		try {
			const v = await ctx.settings.get("reviewsRequirePurchase");
			gated = v === true || v === "true" || v === 1;
		} catch {
			gated = false;
		}
		if (gated) {
			const ok = await hasVerifiedPurchase(
				ctx.storage.orders,
				checked.value.email,
				checked.value.productSlug,
			).catch(() => false);
			if (!ok) {
				return {
					error: {
						code: "NO_PURCHASE",
						message: "Only verified buyers can review. Use the email from your order.",
					},
				};
			}
		}
		await ctx.storage.reviews.put(id, {
			...checked.value,
			status: moderate ? "draft" : "published",
			createdAt: new Date().toISOString(),
		});
		return { received: true, moderated: moderate };
	},
};

export const reviewListRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const productSlug = String(q.productSlug ?? q.product_slug ?? "").slice(0, 120);
		if (!productSlug) return { error: { code: "NO_PRODUCT", message: "Missing productSlug." } };
		const page = await ctx.storage.reviews.query({
			where: { productSlug, status: "published" },
			limit: Math.min(50, Number(q.limit) || 20),
			cursor: q.cursor,
		});
		return {
			items: page.items.map((i: any) => ({
				rating: i.data.rating,
				title: i.data.title,
				body: i.data.body,
				author: i.data.author,
			})),
			cursor: page.cursor ?? null,
			hasMore: page.hasMore,
		};
	},
};

export const reviewSummaryRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const productSlug = String(q.productSlug ?? q.product_slug ?? "").slice(0, 120);
		if (!productSlug) return { error: { code: "NO_PRODUCT", message: "Missing productSlug." } };
		const ratings: number[] = [];
		let cursor: string | undefined;
		do {
			const page = await ctx.storage.reviews.query({
				where: { productSlug, status: "published" },
				limit: 200,
				cursor,
			});
			for (const i of page.items as any[]) {
				const r = Number(i.data?.rating);
				if (Number.isFinite(r)) ratings.push(r);
			}
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);
		return { productSlug, ...summarize(ratings) };
	},
};

export const reviewPendingRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const page = await ctx.storage.reviews.query({
			where: { status: "draft" },
			limit: 50,
		});
		return {
			items: page.items.map((i: any) => ({
				id: i.id,
				productSlug: i.data.productSlug,
				rating: i.data.rating,
				title: i.data.title,
				body: i.data.body,
				author: i.data.author,
				createdAt: i.data.createdAt,
			})),
		};
	},
};

export const reviewAdminListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const where: Record<string, unknown> = {};
		if (q.status === "draft" || q.status === "published") where.status = q.status;
		if (q.productSlug) where.productSlug = String(q.productSlug).slice(0, 120);
		const page = await ctx.storage.reviews.query({
			where,
			limit: Math.min(100, Number(q.limit) || 50),
			cursor: q.cursor,
		});
		return {
			items: page.items.map((i: any) => ({
				id: i.id,
				productSlug: i.data.productSlug,
				rating: i.data.rating,
				title: i.data.title,
				body: i.data.body,
				author: i.data.author,
				status: i.data.status,
				createdAt: i.data.createdAt,
			})),
			cursor: page.cursor ?? null,
			hasMore: page.hasMore,
		};
	},
};

export const reviewModerateRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const id = String(body.id ?? "").slice(0, 160);
		const action = String(body.action ?? "");
		if (!id) return { error: { code: "NO_ID", message: "Missing review id." } };
		if (action === "reject") {
			const deleted = await ctx.storage.reviews.delete(id);
			return { ok: deleted };
		}
		if (action === "approve") {
			const current = await ctx.storage.reviews.getVersioned(id);
			if (!current) return { error: { code: "NOT_FOUND", message: "Unknown review." } };
			const res = await ctx.storage.reviews.compareAndSet(id, current.revision, {
				...current.value,
				status: "published",
			});
			return { ok: res.applied };
		}
		return { error: { code: "BAD_ACTION", message: "Use approve or reject." } };
	},
};
