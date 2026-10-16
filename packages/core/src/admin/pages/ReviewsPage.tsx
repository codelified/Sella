import * as React from "react";
import { api, btn, card, table, td, th, useAsync } from "../lib.js";

interface Review {
	id: string;
	productSlug: string;
	rating: number;
	title: string;
	body: string;
	author: string;
	status?: string;
	createdAt: string;
}

export function ReviewsPage() {
	const [tab, setTab] = React.useState<"pending" | "published">("pending");
	const pending = useAsync(() => api<{ items: Review[] }>("/reviews/pending"), []);
	const published = useAsync(() => api<{ items: Review[] }>("/reviews/admin-list?status=published"), []);
	const [msg, setMsg] = React.useState<string | null>(null);

	async function moderate(id: string, action: "approve" | "reject") {
		if (action === "reject" && !window.confirm("Delete this review permanently?")) return;
		setMsg(null);
		try {
			await api("/reviews/moderate", { method: "POST", body: JSON.stringify({ id, action }) });
			pending.reload();
			published.reload();
		} catch (e) {
			setMsg(e instanceof Error ? e.message : String(e));
		}
	}

	const rows = tab === "pending" ? (pending.data?.items ?? []) : (published.data?.items ?? []);
	const loading = tab === "pending" ? pending.loading : published.loading;
	const error = tab === "pending" ? pending.error : published.error;

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Reviews</h1>
				<div style={{ display: "flex", gap: 6 }}>
					<button style={tab === "pending" ? { ...btn, fontWeight: 800 } : btn} onClick={() => setTab("pending")}>
						Pending ({pending.data?.items.length ?? "…"})
					</button>
					<button style={tab === "published" ? { ...btn, fontWeight: 800 } : btn} onClick={() => setTab("published")}>
						Published
					</button>
				</div>
				<button style={btn} onClick={() => { pending.reload(); published.reload(); }}>Refresh</button>
			</div>
			{msg && <p role="alert">{msg}</p>}
			{loading && <p>Loading…</p>}
			{error && <p role="alert">Error: {error}</p>}
			{!loading && !error && (
				<div style={card}>
					{rows.length === 0 && (
						<p>{tab === "pending" ? "Queue is clear. New submissions land here as drafts." : "No published reviews yet."}</p>
					)}
					{rows.map((r) => (
						<article key={r.id} style={{ borderBottom: "1px solid var(--kumo-border, #f1f1f1)", padding: "12px 0" }}>
							<div>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} <strong>{r.title || "(no headline)"}</strong></div>
							<div style={{ fontSize: 13, color: "var(--kumo-subtle, #6b7280)" }}>{r.productSlug} · by {r.author}</div>
							<p style={{ margin: "6px 0" }}>{r.body}</p>
							<div style={{ display: "flex", gap: 8 }}>
								{tab === "pending" && <button style={btn} onClick={() => void moderate(r.id, "approve")}>Approve</button>}
								<button style={btn} onClick={() => void moderate(r.id, "reject")}>
									{tab === "pending" ? "Reject" : "Delete"}
								</button>
							</div>
						</article>
					))}
				</div>
			)}
			<div style={card}>
				<h2 style={{ marginTop: 0, fontSize: 16 }}>How moderation works</h2>
				<table style={table}>
					<thead><tr><th style={th}>Step</th><th style={th}>What happens</th></tr></thead>
					<tbody>
						<tr><td style={td}>Submit</td><td style={td}>Storefront form → draft review (invisible publicly)</td></tr>
						<tr><td style={td}>Approve</td><td style={td}>Status → published, appears on the product page + average</td></tr>
						<tr><td style={td}>Reject / Delete</td><td style={td}>Deleted permanently, from either tab</td></tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}
