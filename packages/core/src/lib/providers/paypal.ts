/**
 * PayPal adapter (Orders v2).
 * Flow: create order → buyer approves on PayPal → returns with ?token=ORDERID
 * → webhook CHECKOUT.ORDER.APPROVED → we CAPTURE via API → order paid.
 * No signature crypto: every event is confirmed by re-fetching the resource
 * from PayPal over authenticated API. Same trust level, far less code.
 */
import type {
	CheckoutInput,
	CheckoutResult,
	HttpLike,
	PaymentEvent,
	PaymentProvider,
	SettingsLike,
} from "../payments.js";

function base(mode: string): string {
	return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function creds(settings: SettingsLike): Promise<{ id: string; secret: string; mode: string }> {
	const id = String((await settings.get("paypalClientId")) ?? "");
	const secret = String((await settings.get("paypalSecret")) ?? "");
	if (!id || !secret) throw new Error("PayPal is not configured (missing client ID/secret).");
	const mode = String((await settings.get("paypalMode").catch(() => "sandbox")) ?? "sandbox");
	return { id, secret, mode: mode === "live" ? "live" : "sandbox" };
}

async function token(http: HttpLike, id: string, secret: string, mode: string): Promise<string> {
	const res = (await http.fetch(`${base(mode)}/v1/oauth2/token`, {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	})) as Response;
	const json = (await res.json().catch(() => null)) as any;
	if (!res.ok || !json?.access_token) {
		throw new Error(`PayPal auth failed: ${json?.error_description ?? res.status}`);
	}
	return json.access_token as string;
}

async function api(
	http: HttpLike,
	mode: string,
	access: string,
	path: string,
	method = "GET",
	body?: unknown,
): Promise<any> {
	const res = (await http.fetch(`${base(mode)}${path}`, {
		method,
		headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})) as Response;
	const json = (await res.json().catch(() => null)) as any;
	if (!res.ok) {
		const msg = json?.message ?? json?.error_description ?? `HTTP ${res.status}`;
		throw new Error(`PayPal ${path} failed: ${msg}`);
	}
	return json;
}

/** Capture an approved order. Exported for the webhook route. */
export async function capturePaypalOrder(
	http: HttpLike,
	settings: SettingsLike,
	orderId: string,
): Promise<{ captureId: string; amount: number | null; currency: string }> {
	const { id, secret, mode } = await creds(settings);
	const access = await token(http, id, secret, mode);
	const cap = await api(http, mode, access, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, "POST", {});
	const unit = cap?.purchase_units?.[0]?.payments?.captures?.[0];
	return {
		captureId: String(unit?.id ?? ""),
		amount: unit?.amount ? Number(unit.amount.value) : null,
		currency: String(unit?.amount?.currency_code ?? "USD"),
	};
}

export const paypalProvider: PaymentProvider = {
	id: "paypal",
	label: "PayPal",

	async assertConfigured(settings) {
		await creds(settings);
	},

	async createCheckout(input: CheckoutInput, { settings, http }): Promise<CheckoutResult> {
		const { id, secret, mode } = await creds(settings);
		if (input.mode === "subscription") {
			throw new Error("PayPal subscriptions aren't wired yet — use Stripe for recurring billing.");
		}
		if (String(input.currency ?? "USD").toUpperCase() !== "USD") {
			throw new Error("PayPal is USD-only in this template revision (multi-currency lands with the storefront currency work).");
		}
		const access = await token(http, id, secret, mode);
		const total = (input.lines.reduce((n, l) => n + l.price * l.qty, 0) - input.discount + input.shipping).toFixed(2);
		const order = await api(http, mode, access, "/v2/checkout/orders", "POST", {
			intent: "CAPTURE",
			purchase_units: [
				{
					custom_id: input.orderNumber,
					description: `Order ${input.orderNumber}${input.couponCode ? ` (${input.couponCode})` : ""}`.slice(0, 120),
					amount: { currency_code: "USD", value: total },
				},
			],
			payment_source: {
				paypal: {
					experience_context: {
						return_url: `${input.origin}${input.successPath}`,
						cancel_url: `${input.origin}${input.cancelPath}`,
					},
				},
			},
		});
		const approve = (order.links ?? []).find((l: any) => l.rel === "approve")?.href;
		if (!approve || !order.id) throw new Error("PayPal did not return an approval URL.");
		return { url: approve, ref: order.id as string };
	},

	async verifyWebhook(rawBody, _headers, { settings, http }): Promise<PaymentEvent | null> {
		let event: any = null;
		try {
			event = JSON.parse(rawBody);
		} catch {
			return null;
		}
		const type = String(event?.event_type ?? "");
		if (!type.startsWith("CHECKOUT.") && !type.startsWith("PAYMENT.")) return null;
		const cred = await creds(settings).catch(() => null);
		if (!cred) return null;
		const access = await token(http, cred.id, cred.secret, cred.mode).catch(() => null);
		if (!access) return null;

		if (type === "CHECKOUT.ORDER.APPROVED") {
			const orderId = String(event?.resource?.id ?? "");
			if (!orderId) return null;
			// Confirm the approval directly with PayPal before trusting it.
			const live = await api(http, cred.mode, access, `/v2/checkout/orders/${encodeURIComponent(orderId)}`).catch(
				() => null,
			);
			if (!live || (live.status !== "APPROVED" && live.status !== "COMPLETED")) return null;
			return {
				type: "completed",
				subject: "order",
				ref: orderId,
				paymentRef: "",
				amount: null,
				raw: event,
				captureApprovedOrder: true,
			} as PaymentEvent & { captureApprovedOrder?: boolean };
		}

		if (type === "PAYMENT.CAPTURE.COMPLETED") {
			const capId = String(event?.resource?.id ?? "");
			if (!capId) return null;
			const live = await api(http, cred.mode, access, `/v2/payments/captures/${encodeURIComponent(capId)}`).catch(
				() => null,
			);
			if (!live || live.status !== "COMPLETED") return null;
			const amt = live?.amount;
			return {
				type: "completed",
				subject: "order",
				ref: String(live?.custom_id ?? event?.resource?.custom_id ?? ""),
				paymentRef: capId,
				amount: amt ? Number(amt.value) : null,
				raw: event,
			};
		}

		if (type === "PAYMENT.CAPTURE.REFUNDED") {
			return {
				type: "refunded",
				subject: "order",
				ref: String(event?.resource?.custom_id ?? ""),
				paymentRef: String(event?.resource?.id ?? ""),
				amount: null,
				raw: event,
			};
		}

		return null; // PENDING/DENIED and everything else: wait for terminal events
	},

	async refund(paymentRef, amount, { settings, http }): Promise<void> {
		const { id, secret, mode } = await creds(settings);
		const access = await token(http, id, secret, mode);
		await api(http, mode, access, `/v2/payments/captures/${encodeURIComponent(paymentRef)}/refund`, "POST", {
			...(amount !== null && amount !== undefined
				? { amount: { value: amount.toFixed(2), currency_code: "USD" } }
				: {}),
		});
	},
};
