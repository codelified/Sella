export interface CartSnapshot {
	cartId: string;
	email: string;
	items: Array<{ slug: string; name: string; price: number; qty: number }>;
	subtotal: number;
	updatedAt: string;
	converted: boolean;
}

interface KvLike {
	get(key: string): Promise<any | null>;
	set(key: string, value: unknown): Promise<void>;
	list(prefix?: string): Promise<Array<{ key: string; value: unknown }>>;
}

export function cartKey(cartId: string): string {
	return `cart:${String(cartId).slice(0, 80)}`;
}

export async function saveCartSnapshot(
	kv: KvLike,
	input: { cartId: unknown; email?: unknown; items?: unknown; subtotal?: unknown },
): Promise<CartSnapshot | null> {
	const cartId = String(input.cartId ?? "").slice(0, 80);
	if (!cartId) return null;
	const items = Array.isArray(input.items)
		? input.items
				.slice(0, 50)
				.map((i: any) => ({
					slug: String(i?.slug ?? "").slice(0, 120),
					name: String(i?.name ?? "").slice(0, 160),
					price: Number(i?.price) || 0,
					qty: Math.max(0, Math.min(99, Math.floor(Number(i?.qty) || 0))),
				}))
				.filter((i) => i.slug && i.qty > 0)
		: [];
	const prev = ((await kv.get(cartKey(cartId)).catch(() => null)) ?? {}) as Partial<CartSnapshot>;
	const snap: CartSnapshot = {
		cartId,
		email: String(input.email ?? prev.email ?? "").slice(0, 160),
		items,
		subtotal: Math.round(Number(input.subtotal ?? 0) * 100) / 100,
		updatedAt: new Date().toISOString(),
		converted: prev.converted === true,
	};
	await kv.set(cartKey(cartId), snap);
	return snap;
}

export interface StaleCart extends CartSnapshot {
	abandonedMinutes: number;
}

export async function findStaleCarts(
	kv: KvLike,
	olderThanHours: number,
	limit = 100,
): Promise<StaleCart[]> {
	const cutoff = Date.now() - olderThanHours * 3600_000;
	const all = await kv.list("cart:").catch(() => []);
	const out: StaleCart[] = [];
	for (const { value } of all) {
		const c = value as CartSnapshot;
		if (!c || c.converted || !c.email || !c.email.includes("@")) continue;
		if (!Array.isArray(c.items) || c.items.length === 0) continue;
		const updated = new Date(c.updatedAt ?? 0).getTime();
		if (!Number.isFinite(updated) || updated >= cutoff) continue;
		out.push({ ...c, abandonedMinutes: Math.round((Date.now() - updated) / 60000) });
		if (out.length >= limit) break;
	}
	return out;
}

export async function markCartConverted(kv: KvLike, cartId: string): Promise<void> {
	if (!cartId) return;
	const prev = ((await kv.get(cartKey(cartId)).catch(() => null)) ?? null) as CartSnapshot | null;
	if (!prev) return;
	await kv.set(cartKey(cartId), { ...prev, converted: true }).catch(() => null);
}
