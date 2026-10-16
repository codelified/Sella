import * as React from "react";
import { StatusPill, api, btn, btnPrimary, card, input, table, td, th, useAsync } from "../lib.js";

interface OrderRow {
	number: string;
	email: string;
	status: string;
	totalLabel: string;
	itemCount: number;
	couponCode: string;
	createdAt: string;
}

interface OrderDetail extends OrderRow {
	name: string;
	total: number;
	provider: string;
	paymentRef: string;
	items: Array<{ name: string; qty: number; price: number }>;
	address: any;
	notes: string;
	adminNotes: string;
}

export function OrdersPage() {
	const [status, setStatus] = React.useState("");
	const [selected, setSelected] = React.useState<string | null>(null);
	const list = useAsync(
		() => api<{ items: OrderRow[] }>(`/orders/list${status ? `?status=${status}` : ""}`),
		[status],
	);

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Orders</h1>
				<select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...input, width: 180 }}>
					<option value="">All statuses</option>
					{["pending", "paid", "fulfilled", "payment_failed", "refunded", "cancelled"].map((s) => (
						<option key={s} value={s}>{s}</option>
					))}
				</select>
				<button style={btn} onClick={() => list.reload()}>Refresh</button>
			</div>
			{list.loading && <p>Loading…</p>}
			{list.error && <p role="alert">Error: {list.error}</p>}
			{list.data && (
				<div style={card}>
					<table style={table}>
						<thead><tr>
							<th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Status</th>
							<th style={th}>Items</th><th style={th}>Total</th><th style={th}></th>
						</tr></thead>
						<tbody>
							{list.data.items.map((o) => (
								<tr key={o.number}>
									<td style={td}><strong>{o.number}</strong><br /><small>{o.email}</small></td>
									<td style={td}>{o.email}</td>
									<td style={td}><StatusPill status={o.status} /></td>
									<td style={td}>{o.itemCount}</td>
									<td style={td}>{o.totalLabel}</td>
									<td style={td}><button style={btn} onClick={() => setSelected(o.number)}>Open</button></td>
								</tr>
							))}
						</tbody>
					</table>
					{list.data.items.length === 0 && <p>No orders{status ? ` with status ${status}` : ""} yet.</p>}
				</div>
			)}
			{selected && <OrderDetail number={selected} onClose={() => { setSelected(null); list.reload(); }} />}
		</div>
	);
}

function OrderDetail({ number, onClose }: { number: string; onClose: () => void }) {
	const detail = useAsync(
		() => api<{ found: boolean; order: OrderDetail }>(`/orders/detail?number=${encodeURIComponent(number)}`),
		[number],
	);
	const [busy, setBusy] = React.useState(false);
	const [msg, setMsg] = React.useState<string | null>(null);

	async function act(path: string, body: any, confirmMsg: string) {
		if (!window.confirm(confirmMsg)) return;
		setBusy(true);
		setMsg(null);
		try {
			await api(path, { method: "POST", body: JSON.stringify({ number, ...body }) });
			setMsg("Done.");
			detail.reload();
		} catch (e) {
			setMsg(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	const o = detail.data?.order;
	return (
		<div style={card}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h2 style={{ margin: 0 }}>{number}</h2>
				<button style={btn} onClick={onClose}>Close</button>
			</div>
			{detail.loading && <p>Loading…</p>}
			{o && (
				<div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 14 }}>
					<div><StatusPill status={o.status} /> — {o.totalLabel} via {o.provider}</div>
					<div>Customer: {o.name} ({o.email})</div>
					<div>Items: {o.items?.map((i) => `${i.name} × ${i.qty}`).join(", ")}</div>
					{o.couponCode && <div>Coupon: {o.couponCode}</div>}
					{o.notes && <div>Customer notes: {o.notes}</div>}
					{o.adminNotes && <div>Admin notes: {o.adminNotes}</div>}
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
						<button style={btnPrimary} disabled={busy} onClick={() => void act("/orders/set-status", { status: "fulfilled" }, `Mark ${number} fulfilled?`)}>Mark fulfilled</button>
						<button style={btn} disabled={busy} onClick={() => void act("/orders/refund", {}, `Refund ${number} in full via provider?`)}>Refund in full</button>
						<button style={btn} disabled={busy} onClick={() => void act("/orders/set-status", { status: "cancelled" }, `Cancel ${number}?`)}>Cancel order</button>
					</div>
					{msg && <p>{msg}</p>}
				</div>
			)}
		</div>
	);
}
