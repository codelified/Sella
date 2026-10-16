/** Zero-decimal currencies (amounts are whole units, not cents). */
const ZERO_DECIMAL = new Set([
	"BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
	"PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF",
]);

export function decimalsFor(currency: string): number {
	return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function parseCurrencyList(raw: unknown, fallback = ["USD"]): string[] {
	const list = String(raw ?? "")
		.split(",")
		.map((s) => s.trim().toUpperCase())
		.filter((s) => /^[A-Z]{3}$/.test(s));
	return list.length > 0 ? [...new Set(list)] : fallback;
}

export function parseFxRates(raw: unknown): Record<string, number> {
	try {
		const obj = JSON.parse(String(raw ?? "{}"));
		const out: Record<string, number> = { USD: 1 };
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			const code = String(k).toUpperCase();
			const rate = Number(v);
			if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) out[code] = rate;
		}
		return out;
	} catch {
		return { USD: 1 };
	}
}

/** Convert a USD amount to target currency, rounded to its decimals. */
export function convertFromUsd(usd: number, currency: string, rates: Record<string, number>): number {
	const rate = rates[currency.toUpperCase()] ?? 1;
	const decimals = decimalsFor(currency);
	const factor = 10 ** decimals;
	return Math.round(usd * rate * factor) / factor;
}

/** Minor units for Stripe (cents, or whole units for zero-decimal). */
export function minorUnits(amount: number, currency: string): number {
	const factor = 10 ** decimalsFor(currency);
	return Math.round(amount * factor);
}

export function formatMoney(amount: number, currency = "USD"): string {
	try {
		return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
	} catch {
		return `${currency} ${amount.toFixed(decimalsFor(currency))}`;
	}
}
