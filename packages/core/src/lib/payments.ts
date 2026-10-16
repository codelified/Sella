/**
 * Payment provider interface. Every gateway (Stripe, PayPal, manual/COD, …)
 * implements these four operations; checkout, webhook dispatch, orders, stock,
 * and coupons never touch provider SDKs directly.
 *
 * Money rules enforced by callers, not adapters:
 *  - order row goes `pending` BEFORE adapter.createCheckout runs
 *  - adapters only transition state; they can never create money
 *  - idempotency is enforced at the order level (paid guard)
 */
export interface CheckoutInput {
	orderNumber: string;
	email: string;
	/** Lines in CHARGE currency (already converted). */
	lines: Array<{ name: string; price: number; qty: number }>;
	shipping: number;
	discount: number;
	couponCode: string;
	discountKind?: "percent" | "fixed";
	discountValue?: number;
	/** ISO currency the customer is charged in (default "USD"). */
	currency?: string;
	/** Subscription checkout (all lines must be plan-backed). */
	mode?: "payment" | "subscription";
	/** Per-line billing plans, aligned with lines by index. */
	plans?: Array<{ interval: "month" | "year"; intervalCount: number; trialDays: number } | null>;
	origin: string;
	successPath: string;
	cancelPath: string;
	itemsMeta: string; // JSON [{slug, qty}] for stock decrement (≤480 chars)
}

export interface CheckoutResult {
	/** Redirect URL, or null when no redirect is needed (manual). */
	url: string | null;
	/** Provider-side reference (session id, …). Stored on the order. */
	ref: string;
	/** Human instructions for manual methods (bank details, …). */
	instructions?: string;
}

export type PaymentEventType =
	| "completed"
	| "expired"
	| "failed"
	| "refunded"
	| "renewed"
	| "sub_cancelled"
	| "sub_past_due";

export interface PaymentEvent {
	type: PaymentEventType;
	/** Orders vs recurring-billing subjects route to different handlers. */
	subject: "order" | "subscription";
	/** Checkout/session/invoice reference used for idempotent lookup. */
	ref: string;
	/** Provider-side payment id (intent, invoice, …). */
	paymentRef: string;
	/** Amount actually captured/refunded, major units. Null when unknown. */
	amount: number | null;
	raw: unknown;
	/** Subscription extras (subject === "subscription" only). */
	subscriptionId?: string;
	customerEmail?: string;
	periodEnd?: string | null;
}

export interface SettingsLike {
	get(key: string): Promise<unknown>;
}

export interface HttpLike {
	fetch(url: string, init?: Record<string, unknown>): Promise<Response>;
}

export interface PaymentProvider {
	id: string;
	label: string;
	/** Throws when required configuration is missing. */
	assertConfigured(settings: SettingsLike): Promise<void>;
	createCheckout(
		input: CheckoutInput,
		deps: { settings: SettingsLike; http: HttpLike },
	): Promise<CheckoutResult>;
	/** Returns null when the request is not authentic. Throws otherwise. */
	verifyWebhook(
		rawBody: string,
		headers: Record<string, string | null>,
		deps: { settings: SettingsLike; http: HttpLike },
	): Promise<PaymentEvent | null>;
	refund(
		paymentRef: string,
		amount: number | null,
		deps: { settings: SettingsLike; http: HttpLike },
		currency?: string,
	): Promise<void>;
	/** Self-service billing portal (optional; Stripe supports it). */
	portal?(customerRef: string, deps: { settings: SettingsLike; http: HttpLike }): Promise<{ url: string }>;
}
