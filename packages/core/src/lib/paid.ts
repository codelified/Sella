import { markCartConverted } from "./carts.js";
import { recordPaidOrder } from "./customers.js";
import { issueGrant } from "./digital.js";
import { sendLowStockAlert, sendOrderConfirmation } from "./mailer.js";

/**
 * Post-payment enrichment shared by webhook deliveries and manual
 * confirmation. All effects are best-effort and never throw — the order
 * is already safely marked paid before this runs.
 */
export async function onOrderPaid(ctx: any, order: any): Promise<{ emailed: boolean }> {
	const items = Array.isArray(order?.items) ? order.items : [];
	try {
		await recordPaidOrder(ctx.storage.customers, {
			email: String(order?.email ?? ""),
			name: String(order?.name ?? ""),
			address: order?.address ?? {},
			total: Number(order?.total) || 0,
			number: String(order?.number ?? ""),
		});
	} catch {
		/* best-effort */
	}
	try {
		if (ctx.kv && order?.cartId) await markCartConverted(ctx.kv, String(order.cartId));
	} catch {
		/* best-effort */
	}
	// Digital grants: one expiring token per digital line item.
	const grants: Array<{ slug: string; token: string }> = [];
	try {
		if (ctx.storage?.digital && ctx.storage?.downloads) {
			for (const item of items) {
				const slug = String(item?.slug ?? "");
				if (!slug) continue;
				const link = (await ctx.storage.digital.get(`digital:${slug}`).catch(() => null)) as any;
				if (!link?.url) continue;
				const grant = await issueGrant(
					ctx.storage,
					{ number: String(order?.number ?? ""), email: String(order?.email ?? "") },
					slug,
					link,
				).catch(() => null);
				if (grant) grants.push({ slug, token: grant.token });
			}
		}
	} catch {
		/* best-effort */
	}
	// Low-stock alerts: whoever crosses the threshold first wins (KV flag),
	// cleared automatically when stock recovers above lowAt.
	try {
		const support = String((await ctx.settings.get("supportEmail").catch(() => "")) ?? "");
		if (support.includes("@") && ctx.kv) {
			for (const item of items) {
				const slug = String(item?.slug ?? "");
				if (!slug) continue;
				const inv = (await ctx.storage.inventory.get(slug).catch(() => null)) as any;
				if (!inv || typeof inv.stock !== "number" || typeof inv.lowAt !== "number") continue;
				const flagKey = `lowstock:alerted:${slug}`;
				if (inv.stock <= inv.lowAt) {
					const flagged = await ctx.kv.get(flagKey).catch(() => null);
					if (!flagged) {
						const res = await sendLowStockAlert(ctx, support, slug, String(item?.name ?? slug), inv.stock);
						if (res.sent) await ctx.kv.set(flagKey, { at: new Date().toISOString(), stock: inv.stock }).catch(() => null);
					}
				} else {
					await ctx.kv.delete(flagKey).catch(() => null);
				}
			}
		}
	} catch {
		/* best-effort */
	}
	let emailed = false;
	try {
		const res = await sendOrderConfirmation(ctx, {
			number: String(order?.number ?? ""),
			email: String(order?.email ?? ""),
			name: String(order?.name ?? ""),
			items: items.map((i: any) => ({
				name: String(i?.name ?? ""),
				qty: Number(i?.qty) || 0,
				price: Number(i?.price) || 0,
			})),
			total: Number(order?.total) || 0,
		});
		emailed = res.sent;
	} catch {
		emailed = false;
	}
	if (!emailed) {
		ctx.log?.info?.("Order confirmation not sent", {
			order: order?.number,
			reason: "no email provider configured",
		});
	}
	return { emailed };
}
