import * as React from "react";

const BASE = "/_emdash/api/plugins/sella";

export class ApiError extends Error {
	status: number;
	code: string;
	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

async function parseEnvelope<T>(res: Response, fallback: string): Promise<T> {
	let json: any = null;
	try {
		json = await res.json();
	} catch {
		throw new ApiError(res.status, "BAD_RESPONSE", fallback);
	}
	if (!res.ok || !json?.success) {
		throw new ApiError(
			res.status,
			json?.error?.code ?? "REQUEST_FAILED",
			json?.error?.message ?? fallback,
		);
	}
	return json.data as T;
}

export async function api<T>(path: string, init?: RequestInit, fallback = "Request failed"): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			// Required by the host on cookie-authenticated calls, every method.
			"X-EmDash-Request": "1",
			...(init?.headers ?? {}),
		},
	});
	return parseEnvelope<T>(res, fallback);
}

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
	const [data, setData] = React.useState<T | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const reload = React.useCallback(() => {
		let live = true;
		setLoading(true);
		setError(null);
		fn()
			.then((d) => live && setData(d))
			.catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
			.finally(() => live && setLoading(false));
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	React.useEffect(() => reload(), [reload]);
	return { data, error, loading, reload };
}

export function StatusPill({ status }: { status: string }) {
	const colors: Record<string, string> = {
		paid: "#16a34a",
		fulfilled: "#2563eb",
		pending: "#d97706",
		payment_failed: "#dc2626",
		refunded: "#7c3aed",
		cancelled: "#6b7280",
	};
	return (
		<span
			style={{
				display: "inline-block",
				padding: "2px 10px",
				borderRadius: 999,
				fontSize: 12,
				fontWeight: 700,
				color: "#fff",
				background: colors[status] ?? "#6b7280",
			}}
		>
			{status}
		</span>
	);
}

export const card: React.CSSProperties = {
	border: "1px solid var(--kumo-border, #e5e7eb)",
	borderRadius: 12,
	padding: 16,
	background: "var(--kumo-surface, #fff)",
};

export const btn: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "1px solid var(--kumo-border, #d1d5db)",
	background: "var(--kumo-surface, #fff)",
	cursor: "pointer",
	fontWeight: 600,
};

export const btnPrimary: React.CSSProperties = {
	...btn,
	background: "#ea580c",
	borderColor: "#ea580c",
	color: "#fff",
};

export const input: React.CSSProperties = {
	width: "100%",
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--kumo-border, #d1d5db)",
};

export const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
export const th: React.CSSProperties = {
	textAlign: "left",
	padding: "8px",
	borderBottom: "2px solid var(--kumo-border, #e5e7eb)",
};
export const td: React.CSSProperties = {
	padding: "8px",
	borderBottom: "1px solid var(--kumo-border, #f1f1f1)",
	verticalAlign: "top",
};
