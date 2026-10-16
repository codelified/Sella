/** Minimal structural type for the inventory storage collection. */
export interface InventoryStore {
	get(id: string): Promise<any | null>;
	put(id: string, data: Record<string, unknown>): Promise<void>;
	updateIf(
		id: string,
		args: { where: Record<string, unknown>; set?: Record<string, unknown>; delta?: Record<string, unknown> },
	): Promise<{ applied: boolean; data?: any }>;
	query(o: {
		where?: Record<string, unknown>;
		orderBy?: Record<string, "asc" | "desc">;
		limit?: number;
		cursor?: string;
	}): Promise<{ items: Array<{ id: string; data: any }>; cursor?: string; hasMore: boolean }>;
}

export interface InventoryRecord {
	slug: string;
	stock: number;
	lowAt: number;
	updatedAt: string;
}

export interface DecrementResult {
	ok: boolean;
	reason?: "not_found" | "insufficient" | "invalid_qty";
	remaining?: number;
}

function cleanQty(qty: unknown): number {
	const n = typeof qty === "number" ? qty : parseInt(String(qty ?? ""), 10);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(9999, Math.floor(n)));
}

/**
 * Atomically decrement stock. The `gte` guard runs inside the atomic update,
 * so N concurrent checkouts for the last unit yield exactly one winner —
 * overselling is impossible by construction.
 */
export async function decrementStock(
	store: InventoryStore,
	slug: string,
	qty: unknown,
): Promise<DecrementResult> {
	const clean = cleanQty(qty);
	if (clean <= 0) return { ok: false, reason: "invalid_qty" };
	const key = String(slug ?? "").slice(0, 120);
	if (!key) return { ok: false, reason: "not_found" };

	const res = await store.updateIf(key, {
		where: { stock: { gte: clean } },
		delta: { stock: { dec: clean } },
		set: { updatedAt: new Date().toISOString() },
	});
	if (res.applied) {
		return { ok: true, remaining: Number(res.data?.stock ?? NaN) };
	}
	const current = (await store.get(key)) as InventoryRecord | null;
	if (!current) return { ok: false, reason: "not_found" };
	return { ok: false, reason: "insufficient", remaining: Number(current.stock ?? 0) };
}

/** Absolute restock / correction (merchant action, not atomic-guarded). */
export async function adjustStock(
	store: InventoryStore,
	slug: string,
	stock: unknown,
	lowAt = 15,
): Promise<InventoryRecord> {
	const key = String(slug ?? "").slice(0, 120);
	const value = Math.max(0, Math.floor(Number(stock)));
	if (!key || !Number.isFinite(value)) throw new Error("Invalid stock adjustment.");
	const record: InventoryRecord = {
		slug: key,
		stock: value,
		lowAt,
		updatedAt: new Date().toISOString(),
	};
	await store.put(key, record as unknown as Record<string, unknown>);
	return record;
}

/** Items at or below their low-stock threshold (paginated). */
export async function getLowStock(
	store: InventoryStore,
	limit = 50,
): Promise<InventoryRecord[]> {
	// Range filters can't express stock<=lowAt (field-to-field), so page open
	// stock and filter in code. Inventory catalogs are small; paginate fully.
	const out: InventoryRecord[] = [];
	let cursor: string | undefined;
	do {
		const page = await store.query({ orderBy: { stock: "asc" }, limit: 100, cursor });
		for (const item of page.items) {
			const d = item.data as InventoryRecord;
			if (typeof d?.stock === "number" && typeof d?.lowAt === "number" && d.stock <= d.lowAt) {
				out.push(d);
				if (out.length >= limit) return out;
			}
		}
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor);
	return out;
}
