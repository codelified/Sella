import { definePluginRoute } from "emdash";
import { decrementStock } from "../lib/inventory.js";
import { bumpCouponUse } from "../lib/coupons.js";
import { sendPastDueNotice } from "../lib/mailer.js";
import { onOrderPaid } from "../lib/paid.js";
import { capturePaypalOrder } from "../lib/providers/paypal.js";
import { getProvider } from "../lib/registry.js";

/** Subscription lifecycle: renewals, past-due, cancellation. Idempotent per invoice. */
async function applySubscriptionEvent(ctx: any, event: any) {
	const subId = String(event.subscriptionId ?? event.ref ?? "");
	if (!subId) return { received: true, matched: false };
	const now = new Date().toISOString();
	const existing = (await ctx.storage.subscriptions.get(subId).catch(() => null)) as any;
	async function write(patch: Record<string, unknown>) {
		const cur = await ctx.storage.subscriptions.getVersioned(subId).catch(() => null);
		if (cur) {
			await ctx.storage.subscriptions
				.compareAndSet(subId, cur.revision, { ...cur.value, ...patch, updatedAt: now })
				.catch(() => null);
		} else {
			// First sighting (dashboard-created or missed signup): create the record.
			await ctx.storage.subscriptions
				.compareAndSet(subId, null, {
					email: String(event.customerEmail ?? ""),
					slug: "",
					plan: null,
					status: "active",
					renewals: [],
					currentPeriodEnd: (event as any).periodEnd ?? null,
					stripeCustomerId: "",
					orderNumber: "",
					createdAt: now,
					updatedAt: now,
					...patch,
				})
				.catch(() => null);
		}
	}

	if (event.type === "renewed") {
		const invoiceId = String(event.paymentRef ?? "");
		if (
			existing &&
			Array.isArray(existing.renewals) &&
			invoiceId &&
			existing.renewals.some((r: any) => r.invoiceId === invoiceId)
		) {
			return { received: true, matched: true, duplicate: true };
		}
		if ((event as any).initial) {
			await write({ status: "active" });
			return { received: true, matched: true };
		}
		const renewals = [...((existing?.renewals ?? []) as any[])];
		if (invoiceId) renewals.push({ at: now, amount: event.amount, invoiceId });
		await write({ status: "active", renewals, currentPeriodEnd: (event as any).periodEnd ?? existing?.currentPeriodEnd ?? null });
		return { received: true, matched: true };
	}

	if (event.type === "sub_past_due") {
		await write({ status: "past_due" });
		const email = String(existing?.email ?? event.customerEmail ?? "");
		if (email) {
			await sendPastDueNotice(ctx, email, "", "your subscription").catch(() => null);
		}
		return { received: true, matched: true };
	}

	if (event.type === "sub_cancelled") {
		await write({ status: "cancelled" });
		return { received: true, matched: true };
	}

	return { received: true, matched: true, ignored: event.type };
}

function headersOf(ctx: any): Record<string, string | null> {
	const h: any = ctx.request?.headers ?? ctx.headers ?? {};
	// ctx.request is a WHATWG Request proxy: headers is a Headers instance.
	if (h && typeof h.get === "function") {
		const out: Record<string, string | null> = {};
		for (const name of ["stripe-signature"]) {
			try {
				const v = h.get(name);
				if (v) out[name] = v;
			} catch {
				/* ignore */
			}
		}
		return out;
	}
	const out: Record<string, string | null> = {};
	for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
		out[k.toLowerCase()] = typeof v === "string" ? v : null;
	}
	return out;
}

/** Apply a verified payment event to the matching order (idempotent). */
async function applyEvent(ctx: any, event: any, providerId: string) {
	const lookupField = event.type === "refunded" ? "paymentRef" : "providerRef";
	let row =
		(await ctx.storage.orders.query({ where: { [lookupField]: event.ref }, limit: 1 }).catch(() => null))?.items?.[0] ??
		null;
	if (!row && event.type === "completed") {
		// Gateways that reference our order number instead of their own session id.
		row =
			(await ctx.storage.orders.query({ where: { number: event.ref }, limit: 1 }).catch(() => null))?.items?.[0] ??
			null;
	}
	if (!row) {
		ctx.log?.info?.("Webhook for unknown order", { providerId, ref: event.ref });
		return { received: true, matched: false };
	}
	const order = row.data as any;

	if (event.type === "completed") {
		if (order.status === "paid" || order.status === "fulfilled") {
			return { received: true, matched: true, duplicate: true };
		}
		if (order.status !== "pending") {
			return { received: true, matched: true, skipped: order.status };
		}
		const current = await ctx.storage.orders.getVersioned(row.id);
		if (!current) return { received: true, matched: false };
		const adminNotes =
			event.amount !== null && Math.abs(event.amount - Number(order.total)) > 0.005
				? `Amount mismatch: provider settled ${event.amount}, order total ${order.total}.`
				: (order.adminNotes ?? "");
		const res = await ctx.storage.orders.compareAndSet(row.id, current.revision, {
			...current.value,
			status: "paid",
			paymentRef: event.paymentRef || current.value.paymentRef,
			adminNotes,
			updatedAt: new Date().toISOString(),
		});
		if (!res.applied) return { received: true, matched: true, conflict: true };
		// Best-effort side effects AFTER the money record is safe.
		const items = Array.isArray(order.items) ? order.items : [];
		for (const item of items) {
			await decrementStock(ctx.storage.inventory, String(item.slug), Number(item.qty) || 0).catch((e: unknown) =>
				ctx.log?.info?.("Stock decrement failed", { item, error: String(e) }),
			);
		}
		if (order.couponCode) {
			await bumpCouponUse(ctx.storage.coupons, order.couponCode).catch(() => null);
		}
		const { emailed } = await onOrderPaid(ctx, { ...order, status: "paid" });
		return { received: true, matched: true, emailed };
	}

	if (event.type === "expired" || event.type === "failed") {
		if (order.status !== "pending") return { received: true, matched: true, skipped: order.status };
		const current = await ctx.storage.orders.getVersioned(row.id);
		if (!current) return { received: true, matched: false };
		await ctx.storage.orders.compareAndSet(row.id, current.revision, {
			...current.value,
			status: "payment_failed",
			updatedAt: new Date().toISOString(),
		});
		return { received: true, matched: true };
	}

	if (event.type === "refunded") {
		if (order.status === "refunded") return { received: true, matched: true, duplicate: true };
		const current = await ctx.storage.orders.getVersioned(row.id);
		if (!current) return { received: true, matched: false };
		await ctx.storage.orders.compareAndSet(row.id, current.revision, {
			...current.value,
			status: "refunded",
			adminNotes: "Refunded via provider. Stock was NOT auto-restocked — adjust manually.",
			updatedAt: new Date().toISOString(),
		});
		return { received: true, matched: true };
	}

	return { received: true, matched: true, ignored: event.type };
}

export const stripeWebhookRoute = definePluginRoute({
	public: true,
	methods: ["POST"],
	request: { body: "text", headers: ["stripe-signature"] },
	handler: async (ctx: any) => {
		const provider = getProvider("stripe");
		if (!provider) return { error: { code: "NO_PROVIDER", message: "Stripe provider missing." } };
		const raw = typeof ctx.input === "string" ? ctx.input : "";
		if (!raw) return { error: { code: "EMPTY_BODY", message: "Missing webhook body." } };
		const event = await provider
			.verifyWebhook(raw, headersOf(ctx), { settings: ctx.settings, http: ctx.http })
			.catch(() => null);
		if (!event) {
			return { error: { code: "BAD_SIGNATURE", message: "Invalid signature." } };
		}
		// PayPal approve-then-capture: settle the approved order before marking paid.
		const needsCapture = (event as any).captureApprovedOrder === true;
		if (needsCapture) {
			try {
				const cap = await capturePaypalOrder(ctx.http, ctx.settings, event.ref);
				event.paymentRef = cap.captureId;
				event.amount = cap.amount;
			} catch (err) {
				ctx.log?.info?.("PayPal capture failed", { ref: event.ref, error: String(err) });
				return { error: { code: "CAPTURE_FAILED", message: "Payment approved but capture failed — check PayPal dashboard." } };
			}
		}
		if ((event as any).subject === "subscription") {
			return applySubscriptionEvent(ctx, event);
		}
		const applied = await applyEvent(ctx, event, "stripe");
		// Subscription signup: a completed subscription-mode session also opens
		// the subscription record (order flow above already marked it paid).
		const rawSession = (event.raw ?? {}) as any;
		if (event.type === "completed" && rawSession.mode === "subscription" && rawSession.subscription) {
			const subId = String(rawSession.subscription);
			const exists = await ctx.storage.subscriptions.get(subId).catch(() => null);
			if (!exists) {
				const meta = rawSession.metadata ?? {};
				await ctx.storage.subscriptions
					.put(subId, {
						email: String(rawSession.customer_email ?? meta.email ?? ""),
						slug: "",
						plan: null,
						status: rawSession.trial_end ? "trialing" : "active",
						renewals: [],
						currentPeriodEnd: rawSession.trial_end
							? new Date(Number(rawSession.trial_end) * 1000).toISOString()
							: null,
						stripeCustomerId: typeof rawSession.customer === "string" ? rawSession.customer : "",
						orderNumber: String(meta.order_number ?? ""),
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					})
					.catch(() => null);
			}
		}
		return applied;
	},
});

export const paymongoWebhookRoute = definePluginRoute({
	public: true,
	methods: ["POST"],
	request: { body: "text" },
	handler: async (ctx: any) => {
		const provider = getProvider("paymongo");
		if (!provider) return { error: { code: "NO_PROVIDER", message: "PayMongo provider missing." } };
		const raw = typeof ctx.input === "string" ? ctx.input : "";
		if (!raw) return { error: { code: "EMPTY_BODY", message: "Missing webhook body." } };
		const event = await provider
			.verifyWebhook(raw, headersOf(ctx), { settings: ctx.settings, http: ctx.http })
			.catch(() => null);
		if (!event) {
			return { error: { code: "UNVERIFIED", message: "Event could not be confirmed with PayMongo." } };
		}
		return applyEvent(ctx, event, "paymongo");
	},
});

export const paypalWebhookRoute = definePluginRoute({
	public: true,
	methods: ["POST"],
	request: { body: "text" },
	handler: async (ctx: any) => {
		const provider = getProvider("paypal");
		if (!provider) return { error: { code: "NO_PROVIDER", message: "PayPal provider missing." } };
		const raw = typeof ctx.input === "string" ? ctx.input : "";
		if (!raw) return { error: { code: "EMPTY_BODY", message: "Missing webhook body." } };
		const event = await provider
			.verifyWebhook(raw, headersOf(ctx), { settings: ctx.settings, http: ctx.http })
			.catch(() => null);
		if (!event) {
			return { error: { code: "UNVERIFIED", message: "Event could not be confirmed with PayPal." } };
		}
		return applyEvent(ctx, event, "paypal");
	},
});
