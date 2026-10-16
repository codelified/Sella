import * as React from "react";
import { api, btn, btnPrimary, card, input, table, td, th, useAsync } from "../lib.js";

interface Coupon {
	code: string;
	kind: string;
	value: number;
	minSubtotal: number;
	maxUses: number | null;
	usedCount: number;
	active: boolean;
	expiresAt: string | null;
}

const empty = { code: "", kind: "percent", value: 10, minSubtotal: 0, maxUses: "", active: true, expiresAt: "" };

export function CouponsPage() {
	const list = useAsync(() => api<{ items: Coupon[] }>("/coupons/list"));
	const [form, setForm] = React.useState<any>({ ...empty });
	const [editing, setEditing] = React.useState<string | null>(null);
	const [msg, setMsg] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);

	function startEdit(c?: Coupon) {
		if (c) {
			setEditing(c.code);
			setForm({ code: c.code, kind: c.kind, value: c.value, minSubtotal: c.minSubtotal, maxUses: c.maxUses ?? "", active: c.active, expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "" });
		} else {
			setEditing(null);
			setForm({ ...empty });
		}
		setMsg(null);
	}

	async function save(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setMsg(null);
		try {
			await api("/coupons/upsert", {
				method: "POST",
				body: JSON.stringify({
					...form,
					value: Number(form.value),
					minSubtotal: Number(form.minSubtotal) || 0,
					maxUses: form.maxUses === "" ? null : Number(form.maxUses),
					expiresAt: form.expiresAt || null,
				}),
			});
			setMsg("Saved.");
			startEdit();
			list.reload();
		} catch (err) {
			setMsg(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	async function remove(code: string) {
		if (!window.confirm(`Delete coupon ${code}? Past orders keep their discount record.`)) return;
		await api("/coupons/delete", { method: "POST", body: JSON.stringify({ code }) });
		list.reload();
	}

	async function toggle(c: Coupon) {
		await api("/coupons/upsert", {
			method: "POST",
			body: JSON.stringify({ ...c, maxUses: c.maxUses, expiresAt: c.expiresAt, active: !c.active }),
		});
		list.reload();
	}

	const field = (label: string, control: React.ReactNode) => (
		<label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>{label}{control}</label>
	);

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Coupons</h1>
			<div style={card}>
				<h2 style={{ marginTop: 0 }}>{editing ? `Edit ${editing}` : "New coupon"}</h2>
				<form onSubmit={(e) => void save(e)} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
					{field("Code", <input style={input} value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />)}
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
						{field("Kind", <select style={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="percent">Percent %</option><option value="fixed">Fixed USD</option></select>)}
						{field("Value", <input style={input} type="number" min="0" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
						{field("Min subtotal (USD)", <input style={input} type="number" min="0" step="any" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />)}
						{field("Max uses (blank = ∞)", <input style={input} type="number" min="1" step="1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
						{field("Expires (optional)", <input style={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />)}
						{field("Active", <select style={input} value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></select>)}
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button style={btnPrimary} disabled={busy} type="submit">{editing ? "Save" : "Create"}</button>
						{editing && <button style={btn} type="button" onClick={() => startEdit()}>Cancel</button>}
					</div>
					{msg && <p>{msg}</p>}
				</form>
			</div>
			<div style={card}>
				<table style={table}>
					<thead><tr>
						<th style={th}>Code</th><th style={th}>Discount</th><th style={th}>Uses</th><th style={th}>Active</th><th style={th}></th>
					</tr></thead>
					<tbody>
						{(list.data?.items ?? []).map((c) => (
							<tr key={c.code}>
								<td style={td}><strong>{c.code}</strong></td>
								<td style={td}>{c.kind === "percent" ? `${c.value}%` : `$${c.value}`}{c.minSubtotal > 0 ? ` over $${c.minSubtotal}` : ""}</td>
								<td style={td}>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
								<td style={td}>{c.active ? "yes" : "no"}</td>
								<td style={td}>
									<div style={{ display: "flex", gap: 6 }}>
										<button style={btn} onClick={() => startEdit(c)}>Edit</button>
										<button style={btn} onClick={() => void toggle(c)}>{c.active ? "Disable" : "Enable"}</button>
										<button style={btn} onClick={() => void remove(c.code)}>Delete</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{list.loading && <p>Loading…</p>}
				{list.error && <p role="alert">Error: {list.error}</p>}
			</div>
		</div>
	);
}
