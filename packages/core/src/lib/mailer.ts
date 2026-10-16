import { money } from "./money.js";

/**
 * Transactional email, best-effort by contract: returns sent:false when no
 * provider is configured or delivery fails. NEVER throws — callers must not
 * let mail break payment processing. Dev delivers via the console provider.
 */
export interface OrderMailData {
	number: string;
	email: string;
	name: string;
	items: Array<{ name: string; qty: number; price: number }>;
	total: number;
}

interface MailCtx {
	email?: { send(msg: EmailMsg): Promise<void> };
	settings: { get(key: string): Promise<unknown> };
}

interface EmailMsg {
	to: string;
	subject: string;
	text: string;
	replyTo?: string;
}

async function storeOf(ctx: any): Promise<{ store: string; support: string }> {
	const store = String(((await ctx.settings.get("storeName").catch(() => "")) ?? "") || "Our store");
	const support = String((await ctx.settings.get("supportEmail").catch(() => "")) ?? "");
	return { store, support };
}

async function send(ctx: any, msg: EmailMsg): Promise<{ sent: boolean; reason?: string }> {
	try {
		if (!ctx.email || typeof ctx.email.send !== "function") {
			return { sent: false, reason: "no-provider" };
		}
		if (!msg.to || !msg.to.includes("@")) return { sent: false, reason: "no-recipient" };
		await ctx.email.send(msg);
		return { sent: true };
	} catch {
		return { sent: false, reason: "send-failed" };
	}
}

function lines(items: OrderMailData["items"]): string {
	return items.map((i) => `  • ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`).join("\n");
}

export async function sendOrderConfirmation(ctx: any, order: OrderMailData) {
	const { store, support } = await storeOf(ctx);
	return send(ctx, {
		to: order.email,
		subject: `Order ${order.number} confirmed — ${store}`,
		text: [
			`Hi ${order.name || "there"},`,
			``,
			`Thanks for your order ${order.number} from ${store}. It's confirmed and being prepared.`,
			``,
			lines(order.items),
			``,
			`Total charged: ${money(order.total)}`,
			``,
			support ? `Questions? Reply to this email or write to ${support}.` : `Questions? Just reply to this email.`,
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}

export async function sendFulfillmentNotice(ctx: any, order: OrderMailData) {
	const { store, support } = await storeOf(ctx);
	return send(ctx, {
		to: order.email,
		subject: `Order ${order.number} is on its way — ${store}`,
		text: [
			`Hi ${order.name || "there"},`,
			``,
			`Good news: order ${order.number} has shipped.`,
			``,
			lines(order.items),
			``,
			support ? `Something wrong? Write to ${support} within 60 days.` : `Something wrong? Just reply within 60 days.`,
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}

export async function sendRefundNotice(ctx: any, order: OrderMailData & { amount: number | null }) {
	const { store, support } = await storeOf(ctx);
	const what = order.amount !== null ? money(order.amount) : money(order.total);
	return send(ctx, {
		to: order.email,
		subject: `Refund processed for order ${order.number} — ${store}`,
		text: [
			`Hi ${order.name || "there"},`,
			``,
			`We've refunded ${what} for order ${order.number}. It lands back on your original payment method within 5–10 business days.`,
			``,
			support ? `Questions? Write to ${support}.` : `Questions? Just reply to this email.`,
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}

export async function sendReviewRequest(
	ctx: any,
	to: string,
	productName: string,
	productSlug: string,
	storeUrl: string,
) {
	const { store, support } = await storeOf(ctx);
	const url = `${storeUrl.replace(/\/$/, "")}/shop/${productSlug}#reviews`;
	return send(ctx, {
		to,
		subject: `How's your ${productName}? — ${store}`,
		text: [
			`Hi there,`,
			``,
			`It's been a week with your ${productName}. Would you tell future buyers how it's going? It takes a minute:`,
			``,
			url,
			``,
			`Thanks for supporting ${store}.`,
			...(support ? [`Questions about your order? Write to ${support}.`] : []),
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}

export async function sendCartRecovery(
	ctx: any,
	to: string,
	items: OrderMailData["items"],
	subtotal: number,
	unsubscribeUrl: string,
) {
	const { store, support } = await storeOf(ctx);
	return send(ctx, {
		to,
		subject: `You left something behind — ${store}`,
		text: [
			`Hi there,`,
			``,
			`Your cart at ${store} is still waiting (total ${money(subtotal)}):`,
			``,
			lines(items),
			``,
			`Complete your order while stock lasts.`,
			``,
			`Done shopping? Unsubscribe from cart reminders: ${unsubscribeUrl}`,
			...(support ? [`Need help? Write to ${support}.`] : []),
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}

export async function sendLowStockAlert(
	ctx: any,
	to: string,
	slug: string,
	name: string,
	stock: number,
) {
	const { store } = await storeOf(ctx);
	return send(ctx, {
		to,
		subject: `Low stock: ${name} (${stock} left) — ${store}`,
		text: [
			`Heads up from ${store}:`,
			``,
			`${name} (${slug}) is down to ${stock} units.`,
			``,
			`Restock in Admin → Sella → Inventory (plugin storage) or the Products collection.`,
		].join("\n"),
	});
}

export async function sendPastDueNotice(ctx: any, to: string, name: string, productName: string) {
	const { store, support } = await storeOf(ctx);
	return send(ctx, {
		to,
		subject: `Action needed: payment failed — ${store}`,
		text: [
			`Hi ${name || "there"},`,
			``,
			`Your latest payment for ${productName} didn't go through. Update your payment method to keep your subscription active.`,
			``,
			support ? `Need help? Write to ${support}.` : `Need help? Just reply to this email.`,
		].join("\n"),
		...(support ? { replyTo: support } : {}),
	});
}
