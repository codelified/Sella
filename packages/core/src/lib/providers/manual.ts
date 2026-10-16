/**
 * Manual adapter (cash on delivery, bank transfer, in-store pickup, …).
 * Holds zero secrets. Checkout records the order as pending + surfaces the
 * merchant's instructions; the merchant marks it paid in admin.
 */
import type {
	CheckoutInput,
	CheckoutResult,
	PaymentEvent,
	PaymentProvider,
	SettingsLike,
} from "../payments.js";

export const manualProvider: PaymentProvider = {
	id: "manual",
	label: "Manual / Cash on delivery",

	async assertConfigured(settings: SettingsLike): Promise<void> {
		const enabled = await settings.get("manualEnabled");
		if (enabled !== true && enabled !== "true" && enabled !== 1) {
			throw new Error("Manual payments are not enabled.");
		}
	},

	async createCheckout(input: CheckoutInput, { settings }): Promise<CheckoutResult> {
		await this.assertConfigured(settings);
		if (input.mode === "subscription") {
			throw new Error("Manual payments don't support subscriptions — use Stripe.");
		}
		const instructions = String((await settings.get("manualInstructions")) ?? "").slice(0, 2000);
		return { url: null, ref: `manual-${input.orderNumber}`, instructions };
	},

	async verifyWebhook(): Promise<PaymentEvent | null> {
		// No webhooks for manual payments — merchant confirms in admin.
		return null;
	},

	async refund(): Promise<void> {
		throw new Error("Manual payments have no online refund — settle outside the system, then mark refunded in admin.");
	},
};
