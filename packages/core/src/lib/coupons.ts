import { round2 } from "./money.js";

/** Minimal structural type for a plugin storage collection (subset we use). */
export interface CouponStore {
	query(o: {
		where?: Record<string, unknown>;
		limit?: number;
	}): Promise<{ items: Array<{ id: string; data: any }> }>;
	updateIf(
		id: string,
		args: { where: Record<string, unknown>; set?: Record<string, unknown>; delta?: Record<string, unknown> },
	): Promise<{ applied: boolean; data?: any }>;
}

export interface CouponRecord {
	code: string;
	kind: "percent" | "fixed";
	value: number;
	minSubtotal?: number;
	maxUses?: number;
	usedCount?: number;
	active?: boolean;
	expiresAt?: string | null;
	/** "code" = entered at checkout; "automatic" = applied by rules. */
	scope?: "code" | "automatic";
	/** "cart" = whole-cart discount; "bxgy" = buy-X-get-Y-free per line. */
	rule?: "cart" | "bxgy";
	buyQty?: number;
	getQty?: number;
	/** BXGY restriction to one product slug; blank = any qualifying line. */
	productSlug?: string;
}

export interface CouponCheck {
	valid: boolean;
	reason?: string;
	coupon?: CouponRecord;
	discount?: number;
}

export function cleanCode(code: unknown): string {
	return String(code ?? "")
		.toUpperCase()
		.trim()
		.replace(/[^A-Z0-9-_]/g, "")
		.slice(0, 40);
}

export async function validateCoupon(
	store: CouponStore,
	code: unknown,
	subtotal: number,
): Promise<CouponCheck> {
	const clean = cleanCode(code);
	if (!clean) return { valid: false, reason: "Enter a coupon code." };
	if (!Number.isFinite(subtotal) || subtotal < 0) {
		return { valid: false, reason: "Invalid subtotal." };
	}

	const found = await store.query({ where: { code: clean }, limit: 1 });
	const d = (found.items[0]?.data ?? null) as CouponRecord | null;
	if (!d) return { valid: false, reason: "That code doesn't exist." };
	if ((d.scope ?? "code") !== "code") {
		return { valid: false, reason: "That discount applies automatically at checkout." };
	}
	if (d.active === false) return { valid: false, reason: "That code is no longer active." };
	if (d.expiresAt) {
		const exp = new Date(d.expiresAt).getTime();
		if (!Number.isNaN(exp) && exp < Date.now()) {
			return { valid: false, reason: "That code has expired." };
		}
	}
	if (typeof d.maxUses === "number" && (d.usedCount ?? 0) >= d.maxUses) {
		return { valid: false, reason: "That code has reached its usage limit." };
	}
	if (typeof d.minSubtotal === "number" && subtotal < d.minSubtotal) {
		return { valid: false, reason: `Needs a $${d.minSubtotal.toFixed(2)} subtotal.` };
	}
	const value = Number(d.value);
	if (!Number.isFinite(value) || value <= 0) {
		return { valid: false, reason: "That code is misconfigured." };
	}
	const discount =
		d.kind === "percent"
			? round2(Math.min(subtotal, (subtotal * value) / 100))
			: round2(Math.min(subtotal, value));
	return { valid: true, coupon: d, discount };
}

/**
 * Atomically count one redemption. The maxUses guard is evaluated inside the
 * atomic update (literal bound read just before), so concurrent checkouts can
 * never overshoot the limit — unlike read-modify-write counters.
 */
export async function bumpCouponUse(store: CouponStore, code: unknown): Promise<boolean> {
	const clean = cleanCode(code);
	if (!clean) return false;
	const found = await store.query({ where: { code: clean }, limit: 1 });
	const row = found.items[0];
	if (!row) return false;
	const d = row.data as CouponRecord;
	const maxUses = typeof d.maxUses === "number" ? d.maxUses : null;
	const res = await store.updateIf(row.id, {
		where:
			maxUses === null
				? {}
				: { usedCount: { lt: maxUses } },
		delta: { usedCount: { inc: 1 } },
	});
	return res.applied;
}

function baseChecks(d: CouponRecord, subtotal: number): string | null {
	if (d.active === false) return "inactive";
	if (d.expiresAt) {
		const exp = new Date(d.expiresAt).getTime();
		if (!Number.isNaN(exp) && exp < Date.now()) return "expired";
	}
	if (typeof d.maxUses === "number" && (d.usedCount ?? 0) >= d.maxUses) return "exhausted";
	if (typeof d.minSubtotal === "number" && subtotal < d.minSubtotal) return "min-subtotal";
	const value = Number(d.value);
	if (!Number.isFinite(value) || value <= 0) return "misconfigured";
	return null;
}

export interface PricedLineLike {
	slug: string;
	price: number;
	qty: number;
	lineTotal: number;
}

/** Discount value of one automatic rule against priced lines. */
export function automaticDiscount(
	d: CouponRecord,
	lines: PricedLineLike[],
	subtotal: number,
): number {
	if ((d.scope ?? "code") !== "automatic") return 0;
	if (baseChecks(d, subtotal) !== null) return 0;
	const value = Number(d.value);
	if (d.rule === "bxgy") {
		const buy = Math.max(1, Math.floor(Number(d.buyQty) || 1));
		const get = Math.max(1, Math.floor(Number(d.getQty) || 1));
		const only = String(d.productSlug ?? "");
		let total = 0;
		for (const l of lines) {
			if (only && l.slug !== only) continue;
			const sets = Math.floor(l.qty / (buy + get));
			total += sets * get * l.price;
		}
		return Math.round(Math.min(subtotal, total) * 100) / 100;
	}
	// cart rule (default)
	return d.kind === "percent"
		? Math.round(Math.min(subtotal, (subtotal * value) / 100) * 100) / 100
		: Math.round(Math.min(subtotal, value) * 100) / 100;
}

/** Best automatic discount across all active automatic rules (no stacking). */
export async function bestAutomatic(
	store: CouponStore,
	lines: PricedLineLike[],
	subtotal: number,
): Promise<{ discount: number; coupon: CouponRecord | null }> {
	let found: CouponRecord[] = [];
	try {
		const res = await store.query({ limit: 100 });
		found = res.items.map((i) => i.data as CouponRecord);
	} catch {
		return { discount: 0, coupon: null };
	}
	let best = 0;
	let winner: CouponRecord | null = null;
	for (const d of found) {
		const v = automaticDiscount(d, lines, subtotal);
		if (v > best) {
			best = v;
			winner = d;
		}
	}
	return { discount: best, coupon: winner };
}
