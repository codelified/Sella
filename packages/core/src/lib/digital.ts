/**
 * Digital delivery: merchants link a file URL to a product slug; paid buyers
 * get unguessable, expiring, count-limited grant tokens. Serve redirects to
 * the file (no byte proxying) after validating token + expiry + count.
 */
export interface DigitalLink {
	slug: string;
	url: string;
	maxDownloads: number;
	expiryDays: number;
	updatedAt: string;
}

export interface DownloadGrant {
	token: string;
	orderNumber: string;
	email: string;
	slug: string;
	url: string;
	maxDownloads: number;
	usedCount: number;
	expiresAt: string;
	createdAt: string;
}

export function grantToken(): string {
	try {
		const g = globalThis as any;
		if (g.crypto?.randomUUID) return `dl_${g.crypto.randomUUID().replace(/-/g, "")}`;
	} catch {
		/* fall through */
	}
	return `dl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function isDigital(store: any, slug: string): Promise<boolean> {
	try {
		return Boolean(await store.get(`digital:${slug}`));
	} catch {
		return false;
	}
}

export async function issueGrant(
	stores: { downloads: any },
	order: { number: string; email: string },
	slug: string,
	link: DigitalLink,
): Promise<DownloadGrant> {
	const now = new Date();
	const grant: DownloadGrant = {
		token: grantToken(),
		orderNumber: order.number,
		email: order.email,
		slug,
		url: link.url,
		maxDownloads: link.maxDownloads,
		usedCount: 0,
		expiresAt: new Date(now.getTime() + link.expiryDays * 86400_000).toISOString(),
		createdAt: now.toISOString(),
	};
	await stores.downloads.put(grant.token, grant);
	return grant;
}

export async function redeemGrant(
	stores: { downloads: any },
	token: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
	const key = String(token ?? "").slice(0, 80);
	if (!key.startsWith("dl_")) return { ok: false, reason: "Invalid link." };
	const row = (await stores.downloads.getVersioned(key).catch(() => null)) as any;
	if (!row) return { ok: false, reason: "Invalid link." };
	const g = row.value as DownloadGrant;
	if (new Date(g.expiresAt).getTime() < Date.now()) {
		return { ok: false, reason: "This link has expired." };
	}
	if (g.usedCount >= g.maxDownloads) {
		return { ok: false, reason: "Download limit reached. Contact support for a fresh link." };
	}
	const res = await stores.downloads
		.compareAndSet(key, row.revision, { ...g, usedCount: g.usedCount + 1 })
		.catch(() => ({ applied: false }));
	if (!res.applied) return { ok: false, reason: "Try again." };
	return { ok: true, url: g.url };
}
