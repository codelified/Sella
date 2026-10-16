export interface CustomerRecord {
	email: string;
	name: string;
	addresses: Array<{ line1: string; city: string; zip: string }>;
	orderIds: string[];
	totalSpent: number;
	orderCount: number;
	createdAt: string;
	updatedAt: string;
}

interface CustomerStore {
	get(id: string): Promise<any | null>;
	getVersioned(id: string): Promise<{ value: any; revision: string } | null>;
	compareAndSet(id: string, rev: string | null, data: unknown): Promise<{ applied: boolean }>;
	query(o: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: any }>; cursor?: string; hasMore: boolean }>;
}

export function customerId(email: string): string {
	return email.toLowerCase().trim().slice(0, 160);
}

/**
 * Record a paid order against the customer profile (create or merge).
 * Never throws — callers treat customers as best-effort enrichment.
 */
export async function recordPaidOrder(
	store: CustomerStore,
	order: { email: string; name: string; address: any; total: number; number: string },
): Promise<void> {
	const id = customerId(order.email);
	if (!id || !id.includes("@")) return;
	const now = new Date().toISOString();
	const addr = {
		line1: String(order.address?.line1 ?? "").slice(0, 200),
		city: String(order.address?.city ?? "").slice(0, 120),
		zip: String(order.address?.zip ?? "").slice(0, 20),
	};
	for (let attempt = 0; attempt < 2; attempt++) {
		const current = await store.getVersioned(id).catch(() => null);
		if (!current) {
			const created = await store
				.compareAndSet(id, null, {
					email: id,
					name: String(order.name ?? "").slice(0, 120),
					addresses: addr.line1 ? [addr] : [],
					orderIds: [order.number],
					totalSpent: Number(order.total) || 0,
					orderCount: 1,
					createdAt: now,
					updatedAt: now,
				} satisfies CustomerRecord)
				.catch(() => ({ applied: false }));
			if (created.applied) return;
			continue; // raced with another writer — re-read and merge
		}
		const prev = current.value as CustomerRecord;
		const addresses = Array.isArray(prev.addresses) ? [...prev.addresses] : [];
		if (addr.line1 && !addresses.some((a) => a.line1 === addr.line1 && a.zip === addr.zip)) {
			addresses.push(addr);
		}
		const orderIds = Array.isArray(prev.orderIds) ? [...prev.orderIds] : [];
		const isNew = !orderIds.includes(order.number);
		if (isNew) orderIds.push(order.number);
		const res = await store
			.compareAndSet(id, current.revision, {
				...prev,
				name: String(order.name ?? prev.name ?? "").slice(0, 120) || prev.name,
				addresses: addresses.slice(-5),
				orderIds,
				totalSpent: Math.round(((Number(prev.totalSpent) || 0) + (isNew ? Number(order.total) || 0 : 0)) * 100) / 100,
				orderCount: orderIds.length,
				updatedAt: now,
			})
			.catch(() => ({ applied: false }));
		if (res.applied) return;
	}
}
