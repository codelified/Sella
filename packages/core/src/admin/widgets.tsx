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
