import { manualProvider } from "./providers/manual.js";
import { stripeProvider } from "./providers/stripe.js";
import type { PaymentProvider } from "./payments.js";

const REGISTRY: Record<string, PaymentProvider> = {
	stripe: stripeProvider,
	manual: manualProvider,
};

export function getProvider(id: unknown): PaymentProvider | null {
	const key = String(id ?? "stripe").toLowerCase();
	return REGISTRY[key] ?? null;
}

export function listProviders(): Array<{ id: string; label: string }> {
	return Object.values(REGISTRY).map((p) => ({ id: p.id, label: p.label }));
}
