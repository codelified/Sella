/**
 * Review-request candidates: fulfilled orders older than N days, one request
 * per order+product (KV flag), skipped when the buyer already reviewed.
 */
export interface ReviewCandidate {
	orderNumber: string;
	email: string;
	productSlug: string;
	productName: string;
}

export async function findDueReviewRequests(
	stores: { orders: any; reviews: any; kv: any },
	olderThanDays: number,
	limit = 20,
): Promise<ReviewCandidate[]> {
	const cutoff = Date.now() - olderThanDays * 86400_000;
	const out: ReviewCandidate[] = [];
	let cursor: string | undefined;
	let pages = 0;
	while (out.length < limit && pages < 10) {
		const page = await stores.orders.query({ where: { status: "fulfilled" }, limit: 50, cursor });
		for (const row of page.items as any[]) {
			const o = row.data;
			const updated = new Date(o?.updatedAt ?? 0).getTime();
			if (!Number.isFinite(updated) || updated >= cutoff) continue;
			const email = String(o?.email ?? "");
			if (!email.includes("@")) continue;
			const items = Array.isArray(o?.items) ? o.items : [];
			for (const item of items) {
				const slug = String(item?.slug ?? "");
				if (!slug || out.length >= limit) continue;
				const flag = `sent:review:${o.number}:${slug}`;
				if (await stores.kv.get(flag).catch(() => null)) continue;
				if (email && (await reviewedAlready(stores.reviews, slug, email).catch(() => false))) {
					await stores.kv.set(flag, { skipped: "reviewed", at: new Date().toISOString() }).catch(() => null);
					continue;
				}
				out.push({
					orderNumber: String(o.number),
					email,
					productSlug: slug,
					productName: String(item?.name ?? slug),
				});
			}
		}
		cursor = page.hasMore ? page.cursor : undefined;
		if (!cursor) break;
		pages++;
	}
	return out;
}

async function reviewedAlready(reviewsStore: any, productSlug: string, email: string): Promise<boolean> {
	const page = await reviewsStore.query({ where: { productSlug, status: "published" }, limit: 200 });
	return (page.items as any[]).some(
		(r) => String(r.data?.email ?? "").toLowerCase() === email.toLowerCase(),
	);
}

export async function markReviewRequested(kv: any, orderNumber: string, slug: string): Promise<void> {
	await kv
		.set(`sent:review:${orderNumber}:${slug}`, { at: new Date().toISOString() })
		.catch(() => null);
}
