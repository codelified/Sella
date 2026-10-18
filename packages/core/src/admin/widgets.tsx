import * as React from "react";
import { StatusPill, api, useAsync } from "./lib.js";

export function RecentOrdersWidget() {
	const orders = useAsync(() => api<{ items: Array<{ number: string; status: string; totalLabel: string }> }>("/orders/list?limit=5"));
	if (orders.loading) return <p>…</p>;
	if (orders.error) return <p>Unavailable</p>;
	const items = orders.data?.items ?? [];
	if (items.length === 0) return <p>No orders yet.</p>;
	return (
		<ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
			{items.map((o) => (
				<li key={o.number}>
					<strong>{o.number}</strong> <StatusPill status={o.status} /> {o.totalLabel}
				</li>
			))}
		</ul>
	);
}

export function LowStockWidget() {
	const inv = useAsync(() => api<{ items: Array<{ slug: string; stock: number }> }>("/inventory/low-stock"));
	if (inv.loading) return <p>…</p>;
	if (inv.error) return <p>Unavailable</p>;
	const items = inv.data?.items ?? [];
	if (items.length === 0) return <p>All stocked. ✓</p>;
	return (
		<ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
			{items.slice(0, 5).map((i) => (
				<li key={i.slug}>{i.slug} — <strong>{i.stock} left</strong></li>
			))}
		</ul>
	);
}

export function PendingReviewsWidget() {
	const rev = useAsync(() => api<{ items: Array<{ id: string; title: string; author: string }> }>("/reviews/pending"));
	if (rev.loading) return <p>…</p>;
	if (rev.error) return <p>Unavailable</p>;
	const items = rev.data?.items ?? [];
	if (items.length === 0) return <p>Queue clear. ✓</p>;
	return <p>{items.length} review{items.length === 1 ? "" : "s"} waiting — open Reviews to moderate.</p>;
}

/**
 * Setup warning: a store with no usable payment provider cannot take an order,
 * and that used to surface only at checkout. Surface it on the dashboard
 * instead, so a merchant finds out before their first customer does.
 */
export function SetupNeededWidget() {
	const cfg = useAsync(() =>
		api<{ checkoutReady: boolean; providers: Array<{ id: string; label: string; ready: boolean; reason?: string }> }>("/config"),
	);
	if (cfg.loading) return <p>…</p>;
	if (cfg.error) return <p>Unavailable</p>;
	const data = cfg.data;
	if (!data || data.checkoutReady) return null;
	const missing = (data.providers ?? []).filter((p) => !p.ready);
	return (
		<div style={{ display: "grid", gap: 8 }}>
			<p style={{ margin: 0, fontWeight: 600 }}>
				⚠️ Checkout isn't ready — no payment provider is configured.
			</p>
			<p style={{ margin: 0, fontSize: 13 }}>
				Orders placed now will fail at checkout. Fix this before you take a real order.
			</p>
			<ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 4 }}>
				{missing.map((p) => (
					<li key={p.id}>
						<strong>{p.label}</strong> — {p.reason ?? "not configured"}
					</li>
				))}
			</ul>
			<p style={{ margin: 0, fontSize: 13 }}>
				Enable one under <strong>Sella → Settings</strong> (manual payments must be switched on explicitly).
			</p>
		</div>
	);
}
