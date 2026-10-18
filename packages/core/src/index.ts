/**
 * Sella — native EmDash plugin.
 * Phase 2: settings + storage + coupons engine + atomic inventory + seed/sync.
 * Route/handlers live in ./routes/*; pricing math in ./lib/*.
 */
import { definePlugin } from "emdash";
import type { PluginDescriptor, PluginRoute } from "emdash";
import { couponsValidateRoute } from "./routes/coupons.js";
import {
	couponDeleteRoute,
	couponListRoute,
	couponUpsertRoute,
} from "./routes/coupons-admin.js";
import { digitalLinkRoute, digitalListRoute, downloadForOrderRoute, downloadServeRoute } from "./routes/digital.js";
import { orderFulfillItemRoute } from "./routes/fulfillment.js";
import { planLinkRoute, planListRoute, subscriptionListRoute, subscriptionPortalRoute } from "./routes/subscriptions.js";
import {
	checkoutRoute,
	orderBySessionRoute,
	orderMarkPaidRoute,
} from "./routes/checkout.js";
import { cartHeartbeatRoute, cartStaleRoute, cartUnsubscribeRoute, collectStaleCarts, sendStaleRecoveries } from "./routes/carts.js";
import { findDueReviewRequests, markReviewRequested } from "./lib/review-requests.js";
import { sendReviewRequest } from "./lib/mailer.js";
import {
	customerDetailRoute,
	customerListRoute,
	customerLookupRoute,
} from "./routes/customers.js";
import {
	inventoryAdjustRoute,
	inventoryDecrementRoute,
	inventoryListRoute,
	inventoryLowStockRoute,
	inventorySyncRoute,
} from "./routes/inventory.js";
import {
	orderDetailRoute,
	orderListRoute,
	orderRefundRoute,
	orderSetStatusRoute,
} from "./routes/orders.js";
import { reportSummaryRoute } from "./routes/reports.js";
import {
	reviewAdminListRoute,
	reviewListRoute,
	reviewModerateRoute,
	reviewPendingRoute,
	reviewSubmitRoute,
	reviewSummaryRoute,
} from "./routes/reviews.js";
import { seedDemoRoute } from "./routes/seed.js";
import { configRoute } from "./routes/config.js";
import { designActivateRoute, designActiveRoute, designListRoute } from "./routes/designs.js";
import { paymongoWebhookRoute, paypalWebhookRoute, stripeWebhookRoute } from "./routes/webhook.js";

export interface SellaOptions {
	/** Override the free-shipping threshold (defaults to settings value). */
	freeShippingAt?: number;
}

const PLUGIN_ID = "sella";
const PLUGIN_VERSION = "0.2.0";

export function sella(options: SellaOptions = {}): PluginDescriptor<SellaOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: "@sella/core",
		adminEntry: "@sella/core/admin",
		options,
	};
}

export function createPlugin(options: SellaOptions = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,

		capabilities: ["content:read", "content:write", "email:send", "network:request"],
		allowedHosts: ["api.stripe.com", "api-m.paypal.com", "api-m.sandbox.paypal.com", "api.paymongo.com"],

		storage: {
			// NOTE (verified Oct 2026): declaration changes re-sync on restart,
			// but stale unique indexes caused cross-collection UNIQUE failures
			// until the re-sync completed. Rule: keep a field name in
			// uniqueIndexes in at most ONE collection; `email` stays a plain
			// index everywhere and customer-email uniqueness is enforced in code.
			orders: {
				indexes: ["status", "email", "providerRef", "couponCode", ["status", "createdAt"]],
				uniqueIndexes: ["number", "providerRef"],
			},
			inventory: {
				indexes: ["stock"],
			},
			coupons: {
				indexes: ["code", "active"],
				uniqueIndexes: ["code"],
			},
			reviews: {
				indexes: ["productSlug", "status", ["productSlug", "status"]],
			},
			customers: {
				indexes: ["email"],
				uniqueIndexes: [],
			},
			designs: {
				indexes: ["name"],
			},
			digital: {
				indexes: ["slug"],
			},
			downloads: {
				indexes: ["orderNumber", "email"],
			},
			plans: {
				indexes: ["slug"],
			},
			subscriptions: {
				indexes: ["email", "status", "slug"],
			},
		},

		admin: {
			entry: "@sella/core/admin",
			settingsSchema: {
				stripeSecretKey: { type: "secret", label: "Stripe secret key" },
				stripeWebhookSecret: { type: "secret", label: "Stripe webhook secret" },
			stripeMode: {
				type: "select",
				label: "Stripe mode",
				options: [
					{ value: "test", label: "Test" },
					{ value: "live", label: "Live" },
				],
				default: "test",
			},
			paypalClientId: { type: "secret", label: "PayPal client ID" },
			paypalSecret: { type: "secret", label: "PayPal secret" },
			paypalMode: {
				type: "select",
				label: "PayPal mode",
				options: [
					{ value: "sandbox", label: "Sandbox" },
					{ value: "live", label: "Live" },
				],
				default: "sandbox",
			},
			paymongoSecretKey: { type: "secret", label: "PayMongo secret key" },
				freeShippingAt: { type: "number", label: "Free shipping threshold (USD)", default: 75 },
				flatShipping: { type: "number", label: "Flat shipping rate (USD)", default: 6.95 },
				storeName: { type: "string", label: "Store name", default: "Northwind Supply Co." },
				supportEmail: { type: "email", label: "Support email", placeholder: "support@example.com" },
				manualEnabled: { type: "boolean", label: "Enable manual payments (COD / transfer)", default: false },
				manualInstructions: {
					type: "string",
					label: "Manual payment instructions shown at checkout",
					multiline: true,
					default: "Pay on delivery, or transfer to the account details we email you.",
				},
				cartAbandonAfterHours: {
					type: "number",
					label: "Cart counts as abandoned after (hours)",
					min: 1,
					max: 720,
					default: 24,
				},
			reviewsRequireModeration: {
				type: "boolean",
				label: "Hold new reviews for moderation",
				default: true,
			},
			currencies: {
				type: "string",
				label: "Enabled currencies (comma-separated ISO codes)",
				default: "USD",
			},
			defaultCurrency: {
				type: "string",
				label: "Default currency (ISO code)",
				default: "USD",
			},
			fxRatesJson: {
				type: "string",
				label: "FX rates vs USD (JSON, e.g. {\"EUR\": 0.92})",
				multiline: true,
				default: "{}",
			},
			reviewsRequirePurchase: {
				type: "boolean",
				label: "Only verified buyers can review",
				default: false,
			},
			reviewRequestAfterDays: {
				type: "number",
				label: "Ask for reviews N days after fulfillment",
				min: 1,
				max: 90,
				default: 7,
			},
			storeUrl: {
				type: "url",
				label: "Public store URL (links in emails)",
				placeholder: "https://shop.example.com",
				default: "",
			},
		},
			pages: [
				{ path: "/orders", label: "Orders", icon: "shopping-cart", group: "Sella" },
				{ path: "/coupons", label: "Coupons", icon: "ticket", group: "Sella" },
				{ path: "/reviews", label: "Reviews", icon: "star", group: "Sella" },
				{ path: "/reports", label: "Reports", icon: "chart-bar", group: "Sella" },
				{ path: "/designs", label: "Designs", icon: "palette", group: "Sella" },
			],
			widgets: [
				{ id: "recent-orders", title: "Recent orders", size: "half" },
				{ id: "low-stock", title: "Low stock", size: "half" },
				{ id: "pending-reviews", title: "Reviews awaiting moderation", size: "half" },
			],
		},

		routes: {
			status: {
				permission: "plugins:read",
				handler: async (ctx) => ({
					plugin: ctx.plugin.id,
					version: PLUGIN_VERSION,
					freeShippingAt: options.freeShippingAt ?? 75,
					callerId: ctx.user?.id ?? null,
				}),
			},
			"coupons/validate": couponsValidateRoute,
			"coupons/list": couponListRoute,
			"coupons/upsert": couponUpsertRoute,
			"coupons/delete": couponDeleteRoute,
			checkout: checkoutRoute,
			"webhook/stripe": stripeWebhookRoute,
			"webhook/paypal": paypalWebhookRoute,
			"webhook/paymongo": paymongoWebhookRoute,
			"designs/list": designListRoute,
			"designs/activate": designActivateRoute,
			"designs/active": designActiveRoute,
			"orders/by-session": orderBySessionRoute,
			"orders/mark-paid": orderMarkPaidRoute,
			"orders/list": orderListRoute,
			"orders/detail": orderDetailRoute,
			"orders/refund": orderRefundRoute,
			"orders/set-status": orderSetStatusRoute,
			"orders/fulfill-item": orderFulfillItemRoute,
			"plans/link": planLinkRoute,
			"plans/list": planListRoute,
			"subscriptions/list": subscriptionListRoute,
			"subscriptions/portal": subscriptionPortalRoute,
			"digital/link": digitalLinkRoute,
			"digital/list": digitalListRoute,
			"downloads/serve": downloadServeRoute,
			"downloads/for-order": downloadForOrderRoute,
			"reports/summary": reportSummaryRoute,
			"reviews/submit": reviewSubmitRoute,
			config: configRoute,
			"reviews/list": reviewListRoute,
			"reviews/summary": reviewSummaryRoute,
			"reviews/pending": reviewPendingRoute,
			"reviews/admin-list": reviewAdminListRoute,
			"reviews/moderate": reviewModerateRoute,
			"customers/lookup": customerLookupRoute,
			"customers/list": customerListRoute,
			"customers/detail": customerDetailRoute,
			"carts/heartbeat": cartHeartbeatRoute,
			"carts/stale": cartStaleRoute,
			"carts/unsubscribe": cartUnsubscribeRoute,
			"inventory/list": inventoryListRoute,
			"inventory/low-stock": inventoryLowStockRoute,
			"inventory/adjust": inventoryAdjustRoute,
			"inventory/sync": inventorySyncRoute,
			"inventory/decrement": inventoryDecrementRoute,
			"admin/seed-demo": seedDemoRoute,
		} satisfies Record<string, PluginRoute>,

		hooks: {
			// Guardrail: products can never be published with a negative price.
			"content:beforeSave": async (event, ctx) => {
				if (event.collection !== "products") return;
				const price = Number((event.content as any)?.price);
				if (Number.isFinite(price) && price < 0) {
					throw new Error("Product price cannot be negative.");
				}
				ctx.log.info("Product saved", { slug: (event.content as any)?.slug });
			},
			// Hourly automation (all best-effort, all KV-deduped):
			// 1) abandoned-cart recovery emails, 2) post-fulfillment review requests.
			cron: async (_event, ctx) => {
				const { hours, stale } = await collectStaleCarts(ctx as any);
				const storeUrl = String((await (ctx as any).settings.get("storeUrl").catch(() => "")) ?? "");
				const carts = await sendStaleRecoveries(ctx as any, stale as any, storeUrl, 20).catch(() => ({
					sent: 0,
					skipped: stale.length,
				}));
				let days = 7;
				try {
					const v = Number(await (ctx as any).settings.get("reviewRequestAfterDays"));
					if (Number.isFinite(v) && v > 0) days = Math.min(90, v);
				} catch {
					/* default */
				}
				const due = await findDueReviewRequests(
					{ orders: (ctx as any).storage.orders, reviews: (ctx as any).storage.reviews, kv: (ctx as any).kv },
					days,
					20,
				).catch(() => []);
				let requested = 0;
				for (const cand of due) {
					const res = await sendReviewRequest(
						ctx as any,
						cand.email,
						cand.productName,
						cand.productSlug,
						storeUrl,
					).catch(() => ({ sent: false }));
					if (res.sent) {
						await markReviewRequested((ctx as any).kv, cand.orderNumber, cand.productSlug).catch(() => null);
						requested++;
					}
				}
				ctx.log.info("Automation sweep", {
					hours,
					staleCarts: stale.length,
					recoveriesSent: carts.sent,
					reviewRequestsSent: requested,
				});
			},
		},
	});
}

export default createPlugin;
