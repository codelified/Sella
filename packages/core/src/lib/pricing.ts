import { round2 } from "./money.js";

export const FREE_SHIPPING_DEFAULT = 75;
export const FLAT_SHIPPING_DEFAULT = 6.95;

export interface PricedLine {
	slug: string;
	name: string;
	price: number;
	qty: number;
	image: string;
	lineTotal: number;
}

export interface QuoteTotals {
	subtotal: number;
	discount: number;
	shipping: number;
	total: number;
}

export function calculateTotals(
	lines: PricedLine[],
	discount: number,
	freeAt: number,
	flat: number,
): QuoteTotals {
	const subtotal = round2(lines.reduce((n, l) => n + l.lineTotal, 0));
	const clamped = Math.max(0, Math.min(subtotal, round2(discount)));
	const shipping = lines.length === 0 ? 0 : subtotal - clamped >= freeAt ? 0 : flat;
	return { subtotal, discount: clamped, shipping, total: round2(subtotal - clamped + shipping) };
}

export function generateOrderNumber(): string {
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
	return `SE-${Date.now().toString(36).toUpperCase().slice(-4)}${rand}`;
}

export function maskEmail(email: string): string {
	const [user = "", domain = ""] = String(email).split("@");
	if (!domain) return "***";
	return `${user.slice(0, 1)}***@${domain}`;
}

export function isEmail(v: unknown): v is string {
	return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
