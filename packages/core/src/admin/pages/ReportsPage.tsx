import * as React from "react";
import { StatusPill, api, btn, card, table, td, th, useAsync } from "../lib.js";

interface Summary {
	ordersByStatus: Record<string, number>;
	revenue: number;
	revenueLabel: string;
	topProducts: Array<{ name: string; qty: number; revenue: number }>;
	lowStock: number;
	pendingReviews: number;
	recent: Array<{ number: string; email: string; status: string; totalLabel: string; createdAt: string }>;
}

export function ReportsPage() {
	const summary = useAsync(() => api<Summary>("/reports/summary"));
	const s = summary.data;

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Reports</h1>
				<button style={btn} onClick={() => summary.reload()}>Refresh</button>
			</div>
			{summary.loading && <p>Loading…</p>}
			{summary.error && <p role="alert">Error: {summary.error}</p>}
			{s && (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
						<Stat label="Revenue (paid)" value={s.revenueLabel} />
						<Stat label="Orders" value={String(Object.values(s.ordersByStatus).reduce((a, b) => a + b, 0))} />
						<Stat label="Low-stock items" value={String(s.lowStock)} warn={s.lowStock > 0} />
						<Stat label="Pending reviews" value={String(s.pendingReviews)} warn={s.pendingReviews > 0} />
					</div>
					<div style={card}>
						<h2 style={{ marginTop: 0, fontSize: 16 }}>Orders by status</h2>
						<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
							{Object.entries(s.ordersByStatus).map(([st, n]) => (
								<span key={st}><StatusPill status={st} /> × {n}</span>
							))}
							{Object.keys(s.ordersByStatus).length === 0 && <span>No orders yet.</span>}
						</div>
					</div>
					<div style={card}>
						<h2 style={{ marginTop: 0, fontSize: 16 }}>Top products</h2>
						<table style={table}>
							<thead><tr><th style={th}>Product</th><th style={th}>Units</th><th style={th}>Revenue</th></tr></thead>
							<tbody>
								{s.topProducts.map((p) => (
									<tr key={p.name}><td style={td}>{p.name}</td><td style={td}>{p.qty}</td><td style={td}>${p.revenue.toFixed(2)}</td></tr>
								))}
							</tbody>
						</table>
						{s.topProducts.length === 0 && <p>No sales yet.</p>}
					</div>
					<div style={card}>
						<h2 style={{ marginTop: 0, fontSize: 16 }}>Recent orders</h2>
						<table style={table}>
							<thead><tr><th style={th}>Order</th><th style={th}>Status</th><th style={th}>Total</th></tr></thead>
							<tbody>
								{s.recent.map((o) => (
									<tr key={o.number}><td style={td}><strong>{o.number}</strong><br /><small>{o.email}</small></td><td style={td}><StatusPill status={o.status} /></td><td style={td}>{o.totalLabel}</td></tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
	return (
		<div style={{ ...card, borderLeft: `4px solid ${warn ? "#d97706" : "#16a34a"}` }}>
			<div style={{ fontSize: 12, color: "var(--kumo-subtle, #6b7280)" }}>{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
		</div>
	);
}
