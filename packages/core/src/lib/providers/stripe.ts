/**
 * Stripe adapter — raw REST + Web Crypto, zero Node dependencies so the same
 * code runs in-process, in workerd, and in the Cloudflare Worker Loader.
 */
import type {
	CheckoutInput,
	CheckoutResult,
	HttpLike,
	PaymentEvent,
	PaymentProvider,
	SettingsLike,
} from "../payments.js";
import { minorUnits } from "../currency.js";

async function stripeKey(settings: SettingsLike): Promise<string> {
	const key = String((await settings.get("stripeSecretKey")) ?? "");
	if (!key) throw new Error("Stripe is not configured (missing secret key).");
	return key;
}

/** Flatten nested params to Stripe's form encoding: line_items[0][price_data][unit_amount]. */
export function stripeForm(params: Record<string, unknown>): URLSearchParams {
	const out = new URLSearchParams();
	const walk = (prefix: string, value: unknown): void => {
		if (value === undefined || value === null) return;
		if (Array.isArray(value)) {
			value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
		} else if (typeof value === "object") {
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				walk(prefix ? `${prefix}[${k}]` : k, v);
			}
		} else {
			out.append(prefix, String(value));
		}
	};
	walk("", params);
	return out;
}

async function stripeCall(
	http: HttpLike,
	key: string,
	path: string,
	params: Record<string, unknown>,
): Promise<any> {
	const res = (await http.fetch(`https://api.stripe.com${path}`, {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${key}:`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: stripeForm(params).toString(),
	})) as Response;
	const json = (await res.json().catch(() => null)) as any;
	if (!res.ok || json?.error) {
		throw new Error(`Stripe ${path} failed: ${json?.error?.message ?? res.status}`);
	}
	return json;
}

/** Verify `Stripe-Signature` with Web Crypto (no Node `crypto` needed). */
export async function verifyStripeSignature(
	rawBody: string,
	header: string | null,
	secret: string,
	toleranceSec = 300,
): Promise<boolean> {
	if (!header || !secret) return false;
	const parts = Object.fromEntries(
		header.split(",").map((p) => {
			const i = p.indexOf("=");
			return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
		}),
	);
	const t = parts["t"];
	const v1 = header
		.split(",")
		.map((p) => p.trim())
		.filter((p) => p.startsWith("v1="))
		.map((p) => p.slice(3));
	if (!t || v1.length === 0) return false;
	if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
	const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
	const expected = new TextEncoder().encode(hex);
	return v1.some((s) => {
		const a = new TextEncoder().encode(s);
		if (a.length !== expected.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) diff |= a[i]! ^ expected[i]!;
		return diff === 0;
	});
}

function mapEvent(type: string, obj: any): PaymentEvent | null {
	const ref = String(obj?.id ?? "");
	if (!ref) return null;
	const base = { ref, raw: obj };
	switch (type) {
		case "checkout.session.completed":
			return {
				...base,
				subject: "order",
				type: "completed",
				paymentRef: typeof obj.payment_intent === "string" ? obj.payment_intent : "",
				amount: typeof obj.amount_total === "number" ? obj.amount_total / 100 : null,
			};
		case "checkout.session.expired":
			return { ...base, subject: "order", type: "expired", paymentRef: "", amount: null };
		case "payment_intent.payment_failed":
			return { ...base, subject: "order", type: "failed", paymentRef: String(obj?.id ?? ""), amount: null };
		case "charge.refunded": {
			const pi = typeof obj?.payment_intent === "string" ? obj.payment_intent : "";
			return { ...base, subject: "order", type: "refunded", paymentRef: pi, amount: null };
		}
		case "invoice.payment_succeeded": {
			const sub = typeof obj?.subscription === "string" ? obj.subscription : "";
			if (!sub) return null;
			const recurring = obj?.billing_reason === "subscription_cycle";
			return {
				...base,
				subject: "subscription",
				type: "renewed",
				ref: sub,
				paymentRef: String(obj?.id ?? ""),
				amount: typeof obj?.amount_paid === "number" ? obj.amount_paid / 100 : null,
				subscriptionId: sub,
				customerEmail: typeof obj?.customer_email === "string" ? obj.customer_email : "",
				periodEnd: typeof obj?.period_end === "number" ? new Date(obj.period_end * 1000).toISOString() : null,
				initial: !recurring,
			} as PaymentEvent & { initial?: boolean };
		}
		case "invoice.payment_failed": {
			const sub = typeof obj?.subscription === "string" ? obj.subscription : "";
			if (!sub) return null;
			return {
				...base,
				subject: "subscription",
				type: "sub_past_due",
				ref: sub,
				paymentRef: String(obj?.id ?? ""),
				amount: null,
				subscriptionId: sub,
				customerEmail: typeof obj?.customer_email === "string" ? obj.customer_email : "",
			};
		}
		case "customer.subscription.deleted": {
			return {
				...base,
				subject: "subscription",
				type: "sub_cancelled",
				ref,
				paymentRef: "",
				amount: null,
				subscriptionId: ref,
			};
		}
		default:
			return null;
	}
}

export const stripeProvider: PaymentProvider = {
	id: "stripe",
	label: "Stripe",

	async assertConfigured(settings) {
		await stripeKey(settings);
	},

	async createCheckout(input: CheckoutInput, { settings, http }): Promise<CheckoutResult> {
		const key = await stripeKey(settings);
		const currency = (input.currency ?? "USD").toLowerCase();

		let couponId: string | undefined;
		if (input.discount > 0) {
			const created = await stripeCall(http, key, "/v1/coupons", {
				duration: "once",
				name: input.couponCode || `order-${input.orderNumber}`,
				...(input.discountKind === "percent"
					? { percent_off: Math.min(100, Number(input.discountValue ?? 0)) }
					: { amount_off: minorUnits(input.discount, currency), currency }),
			});
			couponId = created.id as string;
		}

		const trialDays =
			input.mode === "subscription"
				? Math.max(0, ...(input.plans ?? []).map((p) => (p ? Number(p.trialDays) || 0 : 0)))
				: 0;

		const session = await stripeCall(http, key, "/v1/checkout/sessions", {
			mode: input.mode === "subscription" ? "subscription" : "payment",
			customer_email: input.email,
			line_items: [
				...input.lines.map((l, i) => {
					const plan = input.plans?.[i];
					return {
						price_data: {
							currency,
							product_data: { name: l.name },
							unit_amount: minorUnits(l.price, currency),
							...(input.mode === "subscription" && plan
								? { recurring: { interval: plan.interval, interval_count: plan.intervalCount } }
								: {}),
						},
						quantity: l.qty,
					};
				}),
				...(input.shipping > 0 && input.mode !== "subscription"
					? [
							{
								price_data: {
									currency,
									product_data: { name: "Standard shipping" },
									unit_amount: minorUnits(input.shipping, currency),
								},
								quantity: 1,
							},
						]
					: []),
			],
			...(input.mode === "subscription"
				? {
						subscription_data: {
							...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
							metadata: { order_number: input.orderNumber },
						},
					}
				: {}),
			...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
			metadata: {
				order_number: input.orderNumber,
				coupon_code: input.couponCode,
				items: input.itemsMeta,
			},
			success_url: `${input.origin}${input.successPath}?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${input.origin}${input.cancelPath}`,
		});
		if (!session.url) throw new Error("Stripe did not return a checkout URL.");
		return { url: session.url as string, ref: session.id as string };
	},

	async verifyWebhook(rawBody, headers, { settings }): Promise<PaymentEvent | null> {
		const secret = String((await settings.get("stripeWebhookSecret")) ?? "");
		const sig = headers["stripe-signature"] ?? headers["Stripe-Signature"] ?? null;
		if (!(await verifyStripeSignature(rawBody, sig, secret))) return null;
		let event: any = null;
		try {
			event = JSON.parse(rawBody);
		} catch {
			return null;
		}
		return mapEvent(String(event?.type ?? ""), event?.data?.object);
	},

	async refund(paymentRef, amount, { settings, http }, currency = "usd"): Promise<void> {
		const key = await stripeKey(settings);
		await stripeCall(http, key, "/v1/refunds", {
			payment_intent: paymentRef,
			...(amount !== null && amount !== undefined ? { amount: minorUnits(amount, currency) } : {}),
		});
	},

	async portal(customerRef, { settings, http }): Promise<{ url: string }> {
		const key = await stripeKey(settings);
		const session = await stripeCall(http, key, "/v1/billing_portal/sessions", {
			customer: customerRef,
		});
		if (!session.url) throw new Error("Stripe did not return a portal URL.");
		return { url: session.url as string };
	},
};
