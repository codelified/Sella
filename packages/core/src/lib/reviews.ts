export interface ReviewInput {
	productSlug: unknown;
	rating: unknown;
	title?: unknown;
	body: unknown;
	author: unknown;
	email?: unknown;
	company?: unknown; // honeypot
}

export interface ReviewRecord {
	productSlug: string;
	rating: number;
	title: string;
	body: string;
	author: string;
	email: string;
	status: "draft" | "published";
	createdAt: string;
}

export function validateReview(input: ReviewInput & Record<string, unknown>): { ok: true; value: Omit<ReviewRecord, "status" | "createdAt" | "email"> & { email: string } } | { ok: false; code: string; message: string } {
	if (input.company) return { ok: false, code: "SPAM", message: "Rejected." }; // honeypot: bots fill it
	const productSlug = String(input.productSlug ?? input.product_slug ?? "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]/g, "")
		.slice(0, 120);
	const rating = Number(input.rating);
	const title = String(input.title ?? "").trim().slice(0, 140);
	const body = String(input.body ?? "").trim().slice(0, 2000);
	const author = String(input.author ?? "").trim().slice(0, 80);
	const emailRaw = String(input.email ?? "").trim().slice(0, 160);
	const email = emailRaw.includes("@") ? emailRaw.toLowerCase() : "";
	if (!productSlug) return { ok: false, code: "NO_PRODUCT", message: "Missing product." };
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		return { ok: false, code: "BAD_RATING", message: "Rating must be 1–5." };
	}
	if (body.length < 10) {
		return { ok: false, code: "TOO_SHORT", message: "Tell us a little more (10+ characters)." };
	}
	if (author.length < 2) return { ok: false, code: "NO_NAME", message: "Add your name." };
	return { ok: true, value: { productSlug, rating, title, body, author, email } };
}

/** Verified-buyer gate: a paid/fulfilled order from this email containing the product. */
export async function hasVerifiedPurchase(
	ordersStore: { query(o: any): Promise<{ items: Array<{ data: any }> }> },
	email: string,
	productSlug: string,
): Promise<boolean> {
	const clean = email.toLowerCase().trim();
	if (!clean.includes("@") || !productSlug) return false;
	const page = await ordersStore.query({ where: { email: clean }, limit: 50 });
	return page.items.some((row) => {
		const o = row.data;
		if (o?.status !== "paid" && o?.status !== "fulfilled") return false;
	 const items = Array.isArray(o?.items) ? o.items : [];
		return items.some((i: any) => String(i?.slug ?? "") === productSlug);
	});
}

export function reviewId(productSlug: string): string {
	const rand = Math.random().toString(36).slice(2, 8);
	return `rev-${productSlug}-${rand}`.slice(0, 120);
}

export function summarize(ratings: number[]): { count: number; average: number } {
	if (ratings.length === 0) return { count: 0, average: 0 };
	const sum = ratings.reduce((n, r) => n + r, 0);
	return { count: ratings.length, average: Math.round((sum / ratings.length) * 10) / 10 };
}
