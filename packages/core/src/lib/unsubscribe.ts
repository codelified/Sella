function randomToken(): string {
	try {
		// Web Crypto is global in Node 19+, workerd, and browsers.
		const g = globalThis as any;
		if (g.crypto?.randomUUID) return g.crypto.randomUUID().replace(/-/g, "").slice(0, 24);
	} catch {
		/* fall through */
	}
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * One-click unsubscribe: token → email mapping plus per-email opt-out flag.
 * Tokens are random; lookup is exact-match. No crypto of our own.
 */
export function newUnsubToken(): string {
	return randomToken();
}

export function unsubTokenKey(token: string): string {
	return `unsubtoken:${String(token).slice(0, 64)}`;
}

export function unsubFlagKey(email: string): string {
	return `unsub:${email.toLowerCase().trim().slice(0, 160)}`;
}

export async function issueUnsubscribeToken(kv: any, email: string): Promise<string> {
	const token = newUnsubToken();
	await kv.set(unsubTokenKey(token), { email: email.toLowerCase().trim() });
	return token;
}

export async function redeemUnsubscribeToken(kv: any, token: string): Promise<string | null> {
	const rec = (await kv.get(unsubTokenKey(String(token).slice(0, 64))).catch(() => null)) as any;
	const email = String(rec?.email ?? "");
	if (!email || !email.includes("@")) return null;
	await kv.set(unsubFlagKey(email), { unsubscribed: true, at: new Date().toISOString() }).catch(() => null);
	await kv.delete(unsubTokenKey(token)).catch(() => null);
	return email;
}

export async function isUnsubscribed(kv: any, email: string): Promise<boolean> {
	const flag = (await kv.get(unsubFlagKey(email)).catch(() => null)) as any;
	return flag?.unsubscribed === true;
}
