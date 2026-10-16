/**
 * PayMongo adapter (GCash, GrabPay, cards — Philippines-first).
 * Same trust pattern as PayPal: webhooks are confirmed by re-fetching the
 * event from PayMongo over authenticated API, never by crypto alone.
 *
 * NOTE: field names follow PayMongo's public API; re-check
 * https://developers.paymongo.com if a call fails after an API change.
 */
import type {
	CheckoutInput,
	CheckoutResult,
	HttpLike,
	PaymentEvent,
	PaymentProvider,
	SettingsLike,
} from "../payments.js";

const API = "https://api.paymongo.com/v1";

async function secretKey(settings: SettingsLike): Promise<string> {
	const key = String((await settings.get("paymongoSecretKey")) ?? "");
	if (!key) throw new Error("PayMongo is not configured (missing secret key).");
	return key;
}

function auth(key: string): string {
	return `Basic ${btoa(`${key}:`)}`;
}

async function api(
	http: HttpLike,
	key: string,
	path: string,
	method = "GET",
	body?: unknown,
): Promise<any> {
	const res = (await http.fetch(`${API}${path}`, {
		method,
		headers: { Authorization: auth(key), "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})) as Response;
	const json = (await res.json().catch(() => null)) as any;
	if (!res.ok || json?.errors) {
		const msg = json?.errors?.[0]?.detail ?? `HTTP ${res.status}`;
		throw new Error(`PayMongo ${path} failed: ${msg}`);
	}
	return json?.data ?? json;
}

export const paymongoProvider: PaymentProvider = {
	id: "paymongo",
	label: "PayMongo (GCash / GrabPay / cards)",

	async assertConfigured(settings) {
		await secretKey(settings);
	},

	async createCheckout(input: CheckoutInput, { settings, http }): Promise<CheckoutResult> {
		const key = await secretKey(settings);
		if (input.mode === "subscription") {
			throw new Error("PayMongo subscriptions aren't wired yet — use Stripe for recurring billing.");
		}
		const currency = (input.currency ?? "PHP").toUpperCase();
		const toMinor = (n: number) => Math.round(n * 100); // centavos / cents
		const session = await api(http, key, "/checkout/sessions", "POST", {
			data: {
				attributes: {
					line_items: [
						...input.lines.map((l) => ({
							name: l.name.slice(0, 120),
							amount: toMinor(l.price),
							currency,
							quantity: l.qty,
						})),
						...(input.shipping > 0
							? [{ name: "Shipping", amount: toMinor(input.shipping), currency, quantity: 1 }]
							: []),
					],
					payment_method_types: ["gcash", "grab_pay", "card", "dob", "dob_ubp"],
					success_url: `${input.origin}${input.successPath}`,
					cancel_url: `${input.origin}${input.cancelPath}`,
					description: `Order ${input.orderNumber}`.slice(0, 120),
					metadata: {
						order_number: input.orderNumber,
						coupon_code: input.couponCode,
						items: input.itemsMeta,
					},
				},
			},
		});
		const url = session?.attributes?.checkout_url;
		const ref = session?.id;
		if (!url || !ref) throw new Error("PayMongo did not return a checkout URL.");
		return { url: url as string, ref: ref as string };
	},

	async verifyWebhook(rawBody, _headers, { settings, http }): Promise<PaymentEvent | null> {
		let event: any = null;
		try {
			event = JSON.parse(rawBody);
		} catch {
			return null;
		}
		// Confirm by re-fetching the event from PayMongo (authenticated).
		const eventId = String(event?.data?.id ?? event?.id ?? "");
		if (!eventId) return null;
		const key = await secretKey(settings).catch(() => "");
		if (!key) return null;
		const live = await api(http, key, `/events/${encodeURIComponent(eventId)}`).catch(() => null);
		if (!live) return null;
		const type = String(live?.attributes?.type ?? "");
		const payload = live?.attributes?.data?.attributes ?? {};
		const meta = payload?.metadata ?? {};
		const ref = String(meta.order_number ?? "");
		if (type === "payment.paid") {
			if (!ref) return null;
			const amount = typeof payload?.amount === "number" ? payload.amount / 100 : null;
			return {
				type: "completed",
				subject: "order",
				ref,
				paymentRef: String(payload?.id ?? live?.id ?? ""),
				amount,
				raw: event,
			};
		}
		if (type === "payment.failed") {
			if (!ref) return null;
			return { type: "failed", subject: "order", ref, paymentRef: "", amount: null, raw: event };
		}
		return null;
	},

	async refund(paymentRef, amount, { settings, http }): Promise<void> {
		const key = await secretKey(settings);
		await api(http, key, "/refunds", "POST", {
			data: {
				attributes: {
					payment_id: paymentRef,
					...(amount !== null && amount !== undefined ? { amount: Math.round(amount * 100) } : {}),
					reason: "requested_by_customer",
				},
			},
		});
	},
};
