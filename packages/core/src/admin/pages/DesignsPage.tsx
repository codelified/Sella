import * as React from "react";
import { api, btn, btnPrimary, card, useAsync } from "../lib.js";

interface Design {
	id: string;
	name: string;
	description: string;
	isPreset: boolean;
	updatedAt: string;
}

export function DesignsPage() {
	const gallery = useAsync(() => api<{ active: string; items: Design[] }>("/designs/list"));
	const [msg, setMsg] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState<string | null>(null);

	async function activate(id: string) {
		setBusy(id);
		setMsg(null);
		try {
			await api("/designs/activate", { method: "POST", body: JSON.stringify({ id }) });
			gallery.reload();
			setMsg(`“${id}” is live — reload the storefront to see it.`);
		} catch (e) {
			setMsg(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	function preview(id: string) {
		window.open(`/shop?design=${encodeURIComponent(id)}`, "_blank", "noopener");
	}

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Designs</h1>
				<button style={btn} onClick={() => gallery.reload()}>Refresh</button>
			</div>
			<p style={{ margin: 0, color: "var(--kumo-subtle, #6b7280)", fontSize: 14 }}>
				Swappable storefront themes. Activating re-skins the whole shop instantly — no redeploy.
				Structure (components, routes) stays the same; colors, surfaces, type and radius change.
			</p>
			{msg && <p role={msg.startsWith("“") ? "status" : "alert"}>{msg}</p>}
			{gallery.loading && <p>Loading…</p>}
			{gallery.error && <p role="alert">Error: {gallery.error}</p>}
			{gallery.data && (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
					{gallery.data.items.map((d) => {
						const isActive = gallery.data!.active === d.id;
						return (
							<article key={d.id} style={{ ...card, borderWidth: 2, borderColor: isActive ? "#16a34a" : undefined }}>
								<DesignSwatch id={d.id} />
								<h2 style={{ fontSize: 16, margin: "10px 0 4px" }}>
									{d.name} {isActive && <span style={{ fontSize: 12, color: "#16a34a" }}>● live</span>}
								</h2>
								<p style={{ fontSize: 13, color: "var(--kumo-subtle, #6b7280)", margin: "0 0 12px" }}>{d.description}</p>
								<div style={{ display: "flex", gap: 8 }}>
									{!isActive && (
										<button style={btnPrimary} disabled={busy === d.id} onClick={() => void activate(d.id)}>
											{busy === d.id ? "…" : "Activate"}
										</button>
									)}
									<button style={btn} onClick={() => preview(d.id)}>Preview</button>
								</div>
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}

function DesignSwatch({ id }: { id: string }) {
	const [css, setCss] = React.useState<string>("");
	React.useEffect(() => {
		let live = true;
		// Design tokens as CSS (server-rendered into the storefront <style>).
		api<{ css: string }>(`/designs/active?design=${encodeURIComponent(id)}`)
			.then((d) => {
				if (live) setCss(d.css || "");
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [id]);
	const get = (name: string) => {
		const m = css.match(new RegExp(`${name}:([^;]+);`));
		return m ? m[1].trim() : "#ccc";
	};
	return (
		<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }} aria-hidden="true">
			{[get("--color-brand"), get("--color-accent"), get("--color-bg"), get("--color-text")].map((c, i) => (
				<span key={i} style={{ height: 36, borderRadius: 8, background: c, border: "1px solid var(--kumo-border, #e5e7eb)" }} />
			))}
		</div>
	);
}
