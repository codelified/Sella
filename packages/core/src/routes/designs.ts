import type { PluginRoute } from "emdash";
import { DESIGN_SCHEMA, PRESETS, renderThemeCss } from "../lib/designs.js";

/** Seed the 3 presets on first use; refresh presets when the schema moves on. */
async function ensurePresets(storage: any): Promise<void> {
	const now = new Date().toISOString();
	for (const p of PRESETS) {
		const existing = (await storage.designs.get(p.id).catch(() => null)) as any;
		if (!existing || (existing.schema ?? 1) < DESIGN_SCHEMA) {
			await storage.designs.put(p.id, { ...p, createdAt: existing?.createdAt ?? now, updatedAt: now }).catch(() => null);
		}
	}
}

async function activeDesignId(ctx: any): Promise<string> {
	try {
		const v = String((await ctx.settings.get("activeDesignId")) ?? "");
		if (v) return v;
	} catch {
		/* fall through */
	}
	return "ember";
}

async function loadDesign(ctx: any, id: string): Promise<any | null> {
	await ensurePresets(ctx.storage).catch(() => null);
	const row = (await ctx.storage.designs.get(id).catch(() => null)) as any;
	if (row) return row;
	// Fall back to ember rather than 404ing the storefront stylesheet.
	return (await ctx.storage.designs.get("ember").catch(() => null)) as any;
}

export const designListRoute: PluginRoute = {
	permission: "plugins:read",
	methods: ["GET"],
	handler: async (ctx: any) => {
		await ensurePresets(ctx.storage).catch(() => null);
		const active = await activeDesignId(ctx);
		const page = await ctx.storage.designs.query({ limit: 50 });
		return {
			active,
			items: page.items.map((i: any) => ({
				id: i.id,
				name: i.data.name,
				description: i.data.description,
				isPreset: i.data.isPreset !== false,
				updatedAt: i.data.updatedAt,
			})),
		};
	},
};

export const designActivateRoute: PluginRoute = {
	permission: "plugins:manage",
	methods: ["POST"],
	handler: async (ctx: any) => {
		const body = (ctx.input ?? {}) as any;
		const id = String(body.id ?? "").slice(0, 80);
		const row = (await ctx.storage.designs.get(id).catch(() => null)) as any;
		if (!row) return { error: { code: "NOT_FOUND", message: "Unknown design." } };
		await ctx.settings.set("activeDesignId", id);
		return { ok: true, active: id };
	},
};

export const designActiveRoute: PluginRoute = {
	public: true,
	methods: ["GET"],
	handler: async (ctx: any) => {
		const q = (ctx.input ?? {}) as any;
		const preview = String(q.design ?? "").slice(0, 80);
		const id = preview || (await activeDesignId(ctx));
		const design = await loadDesign(ctx, id);
		if (!design) return { error: { code: "NO_DESIGNS", message: "No designs yet." } };
		return {
			id: design.id,
			name: design.name,
			description: design.description,
			css: renderThemeCss(design),
		};
	},
};
