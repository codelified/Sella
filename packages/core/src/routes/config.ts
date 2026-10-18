import type { PluginRoute } from "emdash";
import { listProviders } from "../lib/registry.js";

/**
 * Public capability probe.
 *
 * Lets a storefront find out *before* a shopper reaches a dead end which
 * payment providers are usable. Without this, an unconfigured provider only
 * surfaces at checkout: `manual` is off until switched on, and Stripe fails
 * with "missing secret key" on the first order.
 *
 * Provider `assertConfigured()` only reports *whether* a provider is usable —
 * it never returns secret material, so this is safe to expose publicly.
 */
export const configRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const providers: Array<{ id: string; label: string; ready: boolean; reason?: string }> = [];
		for (const p of listProviders()) {
			try {
				const provider = (await import("../lib/registry.js")).getProvider(p.id);
				await provider?.assertConfigured(ctx.settings);
				providers.push({ id: p.id, label: p.label, ready: true });
			} catch (e: any) {
				providers.push({
					id: p.id,
					label: p.label,
					ready: false,
					reason: String(e?.message ?? "Not configured").slice(0, 160),
				});
			}
		}
		const ready = providers.filter((p) => p.ready).map((p) => p.id);
		return {
			commerce: true,
			providers,
			// At least one usable provider means checkout can complete.
			checkoutReady: ready.length > 0,
			ready,
		};
	},
};