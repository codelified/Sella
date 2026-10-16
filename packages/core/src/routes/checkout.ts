import { bestAutomatic, bumpCouponUse, validateCoupon } from "../lib/coupons.js";
import { convertFromUsd, formatMoney, parseCurrencyList, parseFxRates } from "../lib/currency.js";
import { decrementStock } from "../lib/inventory.js";
import { onOrderPaid } from "../lib/paid.js";
import { calculateTotals, generateOrderNumber, isEmail, maskEmail } from "../lib/pricing.js";
import { getProvider } from "../lib/registry.js";
import type { PluginRoute } from "emdash";

function cleanSlug(s: unknown): string {
	return String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 120);
}
function cleanQty(q: unknown): number {
	const n = typeof q === "number" ? q : parseInt(String(q ?? ""), 10);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(99, Math.floor(n)));
}

async function getSetting(ctx: any, key: string, fallback: number): Promise<number> {
	const v = Number(await ctx.settings.get(key).catch(() => NaN));
	return Number.isFinite(v) ? v : fallback;
}

/** Price a client cart from CMS truth + plugin inventory availability. */
async function priceCart(ctx: any, rawLines: any[]) {
	const lines: any[] = [];
	const problems: string[] = [];
	const seen = new Set<string>();

	let catalog: any[] = [];
	try {
		const page = await ctx.content.list("products", { limit: 100 });
		catalog = page?.items ?? [];
	} catch {
		return { lines, problems: ["Catalog is unavailable right now."] };
	}
	const bySlug = new Map(catalog.map((e: any) => [String(e?.slug ?? ""), e]));

	for (const raw of Array.isArray(rawLines) ? rawLines.slice(0, 50) : []) {
		const slug = cleanSlug(raw?.slug);
		const qty = cleanQty(raw?.qty);
		if (!slug || qty <= 0 || seen.has(slug)) continue;
		seen.add(slug);
		const entry: any = bySlug.get(slug);
		if (!entry || (entry.status ?? "published") !== "published") {
			problems.push(`“${slug}” is no longer available and was removed.`);
			continue;
		}
		const price = Number(entry.data?.price);
		if (!Number.isFinite(price) || price < 0) {
			problems.push(`“${entry.data?.name ?? slug}” has an invalid price. Removed.`);
			continue;
		}
		// Availability: plugin inventory wins, CMS stock field is the fallback.
		let available: number | null = null;
		try {
			const inv = (await ctx.storage.inventory.get(slug)) as any;
			if (inv && typeof inv.stock === "number") available = inv.stock;
		} catch {
			/* fall through to CMS stock */
		}
		if (available === null && typeof entry.data?.stock === "number") available = entry.data.stock;
		if (available !== null && available <= 0) {
			problems.push(`“${entry.data?.name}” just sold out and was removed.`);
			continue;
		}
		const finalQty = available !== null ? Math.min(qty, available) : qty;
		if (finalQty < qty) problems.push(`Only ${finalQty} × “${entry.data?.name}” left — quantity adjusted.`);
		let digital = false;
		try {
			digital = Boolean(await ctx.storage.digital.get(`digital:${slug}`));
		} catch {
			digital = false;
		}
		lines.push({
			slug,
			name: String(entry.data?.name ?? slug),
			price: Math.round(price * 100) / 100,
			qty: finalQty,
			image: entry.data?.image?.src ?? "",
			lineTotal: Math.round(price * finalQty * 100) / 100,
			digital,
		});
	}
	return { lines, problems };
}

export const checkoutRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const email = String(body.email ?? "").trim();
		if (!isEmail(email)) {
			return { error: { code: "BAD_EMAIL", message: "Enter a valid email." } };
		}
		const provider = getProvider(body.provider ?? "stripe");
		if (!provider) {
			return { error: { code: "BAD_PROVIDER", message: `Unknown provider "${String(body.provider)}".` } };
		}

		const { lines, problems } = await priceCart(ctx, body.items);
		if (lines.length === 0) {
			return { error: { code: "EMPTY_CART", message: "Your cart is empty or unavailable.", problems } };
		}
		const subtotal = lines.reduce((n: number, l: any) => n + l.lineTotal, 0);

		let couponCode = "";
		let discount = 0;
		let discountKind: "percent" | "fixed" | undefined;
		let discountValue = 0;
		if (body.coupon) {
			const check = await validateCoupon(ctx.storage.coupons, body.coupon, subtotal);
			if (!check.valid) {
				return { error: { code: "BAD_COUPON", message: check.reason ?? "Invalid coupon." } };
			}
			couponCode = String(check.coupon!.code);
			discount = check.discount ?? 0;
			discountKind = check.coupon!.kind;
			discountValue = Number(check.coupon!.value);
		}
		// Automatic discounts: best wins against an entered code (no stacking).
		const auto = await bestAutomatic(ctx.storage.coupons, lines, subtotal).catch(() => ({
			discount: 0,
			coupon: null,
		}));
		if (auto.coupon && auto.discount > discount) {
			couponCode = `AUTO:${auto.coupon.code}`;
			discount = auto.discount;
			discountKind = auto.coupon.kind;
			discountValue = Number(auto.coupon.value);
		}

		const freeAt = await getSetting(ctx, "freeShippingAt", 75);
		const flat = await getSetting(ctx, "flatShipping", 6.95);
		const totals = calculateTotals(lines, discount, freeAt, flat);
		// All-digital carts ship nothing — there is nothing to ship.
		if (lines.length > 0 && lines.every((l: any) => l.digital)) {
			totals.shipping = 0;
			totals.total = Math.round((totals.subtotal - totals.discount) * 100) / 100;
		}

		// Subscription detection: every line needs a plan, or none may have one.
		const plans: Array<{ interval: "month" | "year"; intervalCount: number; trialDays: number } | null> = [];
		for (const l of lines) {
			let plan: any = null;
			try {
				plan = await ctx.storage.plans.get(`plan:${l.slug}`);
			} catch {
				plan = null;
			}
			plans.push(
				plan
					? {
							interval: plan.interval === "year" ? "year" : "month",
							intervalCount: Math.max(1, Number(plan.intervalCount) || 1),
							trialDays: Math.max(0, Number(plan.trialDays) || 0),
						}
					: null,
			);
		}
		const plannedCount = plans.filter(Boolean).length;
		if (plannedCount > 0 && plannedCount < lines.length) {
			return {
				error: {
					code: "MIXED_CART",
					message: "Subscriptions checkout separately — remove one-time items or check out twice.",
				},
			};
		}
		const mode = plannedCount === lines.length && lines.length > 0 ? "subscription" : "payment";

		// Currency: USD base converted at checkout. Coupon values are USD.
		let enabled: string[] = ["USD"];
		let defaultCurrency = "USD";
		let rates: Record<string, number> = { USD: 1 };
		try {
			enabled = parseCurrencyList(await ctx.settings.get("currencies"));
			defaultCurrency = String((await ctx.settings.get("defaultCurrency")) ?? "USD").toUpperCase() || "USD";
			if (!enabled.includes(defaultCurrency)) enabled = [defaultCurrency, ...enabled];
			rates = parseFxRates(await ctx.settings.get("fxRatesJson"));
		} catch {
			/* merchant defaults */
		}
		const currency = enabled.includes(String(body.currency ?? "").toUpperCase())
			? String(body.currency).toUpperCase()
			: defaultCurrency;
		const charge = {
			subtotal: convertFromUsd(totals.subtotal, currency, rates),
			discount: convertFromUsd(totals.discount, currency, rates),
			shipping: convertFromUsd(totals.shipping, currency, rates),
		};
		const chargeTotal = Math.round((charge.subtotal - charge.discount + charge.shipping) * 100) / 100;
		const chargeLines = lines.map((l: any) => ({
			...l,
			price: convertFromUsd(l.price, currency, rates),
			lineTotal: convertFromUsd(l.lineTotal, currency, rates),
		}));
		const orderNumber = generateOrderNumber();
		const now = new Date().toISOString();
	 const address = body.address && typeof body.address === "object" ? body.address : {};

		// Pending order FIRST — no provider call exists without an order row.
		// Amounts are stored in the CHARGE currency (+ USD reference for reports).
		const created = await ctx.storage.orders.compareAndSet(orderNumber, null, {
			number: orderNumber,
			email,
			name: String(body.name ?? "").slice(0, 120),
			items: chargeLines.map((l: any) => ({ slug: l.slug, name: l.name, price: l.price, qty: l.qty, image: l.image })),
			subtotal: charge.subtotal,
			discount: charge.discount,
			shipping: charge.shipping,
			total: chargeTotal,
			currency,
			usdTotal: totals.total,
			fxRate: rates[currency] ?? 1,
			status: "pending",
			provider: provider.id,
			mode,
			// Placeholder until the adapter returns its reference. Unique from
			// birth: the providerRef unique index rejects duplicate "" values.
			providerRef: orderNumber,
			paymentRef: "",
			couponCode,
			address: {
				line1: String(address.line1 ?? "").slice(0, 200),
				city: String(address.city ?? "").slice(0, 120),
				zip: String(address.zip ?? "").slice(0, 20),
			},
			notes: String(body.notes ?? "").slice(0, 1000),
			adminNotes: "",
			cartId: String(body.cartId ?? "").slice(0, 80),
			createdAt: now,
			updatedAt: now,
		});
		if (!created.applied) {
			return { error: { code: "ORDER_FAILED", message: "Could not start your order. Try again." } };
		}

		const origin = String(ctx.request?.url ? new URL(ctx.request.url).origin : "").replace(/\/$/, "");
		try {
			const result = await provider.createCheckout(
				{
					orderNumber,
					email,
					lines: chargeLines,
					shipping: charge.shipping,
					discount: charge.discount,
					couponCode,
					discountKind,
					discountValue: discountKind === "percent" ? discountValue : charge.discount,
					currency,
					mode,
					plans,
					origin,
					successPath: "/thank-you",
					cancelPath: "/checkout?cancelled=1",
					itemsMeta: JSON.stringify(lines.map((l: any) => ({ slug: l.slug, qty: l.qty }))).slice(0, 480),
				},
				{ settings: ctx.settings, http: ctx.http },
			);
			await ctx.storage.orders.compareAndSet(orderNumber, created.revision, {
				...(await ctx.storage.orders.get(orderNumber)),
				providerRef: result.ref,
				updatedAt: new Date().toISOString(),
			});
			return {
				url: result.url,
				instructions: result.instructions ?? null,
				orderNumber,
				problems,
				currency,
				total: chargeTotal,
				totalLabel: formatMoney(chargeTotal, currency),
			};
		} catch (err) {
			await ctx.storage.orders.compareAndSet(orderNumber, created.revision, {
				...(await ctx.storage.orders.get(orderNumber)),
				status: "cancelled",
				adminNotes: `Checkout failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
				updatedAt: new Date().toISOString(),
			});
			return {
				error: {
					code: provider.id === "stripe" ? "STRIPE_FAILED" : "PROVIDER_FAILED",
					message: err instanceof Error ? err.message : "Payment provider error. Try again.",
				},
			};
		}
	},
};

export const orderBySessionRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const sessionId = String(body.sessionId ?? body.session_id ?? "").slice(0, 200);
		if (!sessionId) return { error: { code: "NO_SESSION", message: "Missing session." } };
		const found = await ctx.storage.orders.query({ where: { providerRef: sessionId }, limit: 1 });
		const row = found.items[0]?.data;
		if (!row) return { found: false };
		const items = Array.isArray(row.items) ? row.items : [];
		return {
			found: true,
			orderNumber: row.number,
			status: row.status,
			total: Number(row.total),
			totalLabel: formatMoney(Number(row.total), String(row.currency ?? "USD")),
			email: maskEmail(String(row.email ?? "")),
			itemCount: items.reduce((n: number, i: any) => n + (Number(i.qty) || 0), 0),
		};
	},
};

export const orderMarkPaidRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const number = String(body.orderNumber ?? body.number ?? "").slice(0, 40);
		const row = (await ctx.storage.orders.get(number)) as any;
		if (!row) return { error: { code: "NOT_FOUND", message: "Unknown order." } };
		if (row.status === "paid" || row.status === "fulfilled") return { ok: true, status: row.status };
		const current = await ctx.storage.orders.getVersioned(number);
		if (!current) return { error: { code: "NOT_FOUND", message: "Unknown order." } };
		const res = await ctx.storage.orders.compareAndSet(number, current.revision, {
			...current.value,
			status: "paid",
			paymentRef: String(body.paymentRef ?? `manual-${number}`),
			updatedAt: new Date().toISOString(),
		});
		if (!res.applied) return { error: { code: "CONFLICT", message: "Order changed — reload and retry." } };
		// Same post-payment effects as a webhook delivery.
		const items = Array.isArray(current.value.items) ? current.value.items : [];
		for (const item of items) {
			await decrementStock(ctx.storage.inventory, String(item.slug), Number(item.qty) || 0).catch(() => null);
		}
		if (current.value.couponCode) {
			await bumpCouponUse(ctx.storage.coupons, current.value.couponCode).catch(() => null);
		}
		const { emailed } = await onOrderPaid(ctx, { ...current.value, status: "paid" });
		return { ok: true, status: "paid", emailed };
	},
};
