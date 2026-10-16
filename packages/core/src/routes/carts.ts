import { findStaleCarts, saveCartSnapshot } from "../lib/carts.js";
import { sendCartRecovery } from "../lib/mailer.js";
import { isUnsubscribed, issueUnsubscribeToken, redeemUnsubscribeToken } from "../lib/unsubscribe.js";
import type { PluginRoute } from "emdash";

async function abandonHours(ctx: any, fallback = 24): Promise<number> {
	try {
		const v = Number(await ctx.settings.get("cartAbandonAfterHours"));
		if (Number.isFinite(v) && v > 0) return Math.min(720, v);
	} catch {
		/* fall through */
	}
	return fallback;
}

export async function collectStaleCarts(ctx: any) {
	const hours = await abandonHours(ctx);
	const stale = await findStaleCarts(ctx.kv, hours, 100);
	return { hours, stale };
}

export const cartHeartbeatRoute: PluginRoute = {
	public: true,
	methods: ["POST"],
	handler: async (ctx: any) => {
		const snap = await saveCartSnapshot(ctx.kv, ((ctx.input ?? {}) as any) ?? {});
		if (!snap) return { error: { code: "BAD_INPUT", message: "Missing cartId." } };
		return { ok: true };
	},
};

export const cartStaleRoute: PluginRoute = {
	permission: "plugins:read",
	handler: async (ctx: any) => {
		const { hours, stale } = await collectStaleCarts(ctx);
		return {
			hours,
			count: stale.length,
			carts: stale.map((c) => ({
				cartId: c.cartId,
				email: c.email,
				items: c.items.length,
				subtotal: c.subtotal,
				abandonedMinutes: c.abandonedMinutes,
			})),
		};
	},
};

export const cartUnsubscribeRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const email = await redeemUnsubscribeToken(ctx.kv, String(q.token ?? ""));
		if (!email) return { error: { code: "BAD_TOKEN", message: "Invalid or expired link." } };
		return { ok: true };
	},
};

/** Send one recovery email per stale cart (KV-flagged, unsubscribe-aware). */
export async function sendStaleRecoveries(
	ctx: any,
	stale: Array<{ cartId: string; email: string; items: any[]; subtotal: number }>,
	storeUrl: string,
	cap = 20,
): Promise<{ sent: number; skipped: number }> {
	let sent = 0;
	let skipped = 0;
	for (const cart of stale.slice(0, cap)) {
		const flag = `sent:cart:${cart.cartId}`;
		if (await ctx.kv.get(flag).catch(() => null)) {
			skipped++;
			continue;
		}
		if (await isUnsubscribed(ctx.kv, cart.email).catch(() => false)) {
			skipped++;
			continue;
		}
		const token = await issueUnsubscribeToken(ctx.kv, cart.email).catch(() => "");
		const res = await sendCartRecovery(
			ctx,
			cart.email,
			cart.items.map((i: any) => ({ name: String(i?.name ?? ""), qty: Number(i?.qty) || 0, price: Number(i?.price) || 0 })),
			Number(cart.subtotal) || 0,
			`${storeUrl.replace(/\/$/, "")}/unsubscribe?token=${token}`,
		).catch(() => ({ sent: false }));
		if (res.sent) {
			await ctx.kv.set(flag, { at: new Date().toISOString() }).catch(() => null);
			sent++;
		} else {
			skipped++;
		}
	}
	return { sent, skipped };
}
