/**
 * Sella Designs — runtime-swappable storefront themes.
 * A design is a token map (light + dark) applied as one stylesheet.
 * Switching designs never touches code and needs no redeploy.
 */
export interface DesignTokens {
	brand: string;
	brandStrong: string;
	brandSoft: string;
	accent: string;
	accentSoft: string;
	bg: string;
	surface: string;
	text: string;
	muted: string;
	border: string;
	radius: string;
	/** Font keys — see FONTS. */
	fontBody: string;
	fontDisplay: string;
	/** Base font size, e.g. "16px". Scales the whole type system. */
	fontSizeBase: string;
	/** Border width, e.g. "1px". */
	borderWidth: string;
	/** Shadow personality. */
	shadow: "soft" | "bold" | "flat";
	/** Layout rhythm. */
	maxWidth: string;
	sectionPad: string;
	/** Ambient background texture. */
	pattern: "none" | "dots" | "grid" | "glow";
}

export interface DesignRecord {
	id: string;
	name: string;
	description: string;
	isPreset: boolean;
	/** Schema version — bump to re-seed presets after shape changes. */
	schema: number;
	light: DesignTokens;
	dark: DesignTokens;
	createdAt: string;
	updatedAt: string;
}

export const DESIGN_SCHEMA = 3;

/** Curated font menu. Google families load via @import at runtime. */
export const FONTS: Record<string, { label: string; stack: string; google?: string }> = {
	inter: { label: "Inter", stack: '"Inter", system-ui, sans-serif', google: "Inter" },
	fraunces: { label: "Fraunces", stack: '"Fraunces", Georgia, serif', google: "Fraunces" },
	manrope: { label: "Manrope", stack: '"Manrope", system-ui, sans-serif', google: "Manrope" },
	"dm-serif": { label: "DM Serif", stack: '"DM Serif Display", Georgia, serif', google: "DM Serif Display" },
	"space-grotesk": { label: "Space Grotesk", stack: '"Space Grotesk", system-ui, sans-serif', google: "Space Grotesk" },
	system: { label: "System", stack: 'system-ui, -apple-system, sans-serif' },
	georgia: { label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
};

const SHADOWS: Record<string, { sm: string; lg: string; xl: string }> = {
	soft: {
		sm: "0 1px 2px rgba(28,25,23,.06)",
		lg: "0 18px 40px -12px rgba(28,25,23,.25)",
		xl: "0 28px 60px -16px rgba(28,25,23,.32)",
	},
	bold: {
		sm: "0 2px 0 rgba(28,25,23,.9)",
		lg: "0 8px 0 rgba(28,25,23,.9)",
		xl: "0 14px 0 rgba(28,25,23,.9)",
	},
	flat: { sm: "none", lg: "none", xl: "none" },
};

function patternCss(pattern: string): string {
	switch (pattern) {
		case "dots":
			return "background-image:radial-gradient(color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1.4px);background-size:22px 22px;";
		case "grid":
			return "background-image:linear-gradient(color-mix(in srgb, var(--color-text) 5%, transparent) 1px, transparent 1px),linear-gradient(90deg, color-mix(in srgb, var(--color-text) 5%, transparent) 1px, transparent 1px);background-size:44px 44px;";
		case "glow":
			return "background-image:radial-gradient(60rem 30rem at 50% -10rem, color-mix(in srgb, var(--color-brand) 14%, transparent), transparent 70%);background-repeat:no-repeat;";
		default:
			return "";
	}
}

export const PRESETS: Array<Omit<DesignRecord, "createdAt" | "updatedAt">> = [
	{
		id: "ember",
		name: "Ember",
		description: "Warm paper, ink and ember orange. The default Northwind look.",
		isPreset: true,
		schema: DESIGN_SCHEMA,
		light: {
			brand: "#c2410c", brandStrong: "#9a3412", brandSoft: "#fed7aa",
			accent: "#2d4a32", accentSoft: "#dde8dc",
			bg: "#faf6ef", surface: "#f3ecdf", text: "#1c1917", muted: "#78716c",
			border: "#e3d9c6", radius: "14px",
			fontBody: "inter",
			fontDisplay: "fraunces",
			fontSizeBase: "16px",
			borderWidth: "1px",
			shadow: "soft",
			maxWidth: "1200px",
			sectionPad: "8rem 0",
			pattern: "glow",
		},
		dark: {
			brand: "#fb923c", brandStrong: "#ea580c", brandSoft: "#7c2d12",
			accent: "#86b48e", accentSoft: "#24402a",
			bg: "#171310", surface: "#221c17", text: "#f5efe4", muted: "#a8a094",
			border: "#3a3129", radius: "14px",
			fontBody: "inter",
			fontDisplay: "fraunces",
			fontSizeBase: "16px",
			borderWidth: "1px",
			shadow: "soft",
			maxWidth: "1200px",
			sectionPad: "8rem 0",
			pattern: "glow",
		},
	},
	{
		id: "forest",
		name: "Forest",
		description: "Deep pine and moss. Quiet, premium, outdoorsy.",
		isPreset: true,
		schema: DESIGN_SCHEMA,
		light: {
			brand: "#2d4a32", brandStrong: "#1d3322", brandSoft: "#cfdccb",
			accent: "#b7792b", accentSoft: "#f0e2c4",
			bg: "#e9ede0", surface: "#dbe1cd", text: "#1a2b1f", muted: "#5c6656",
			border: "#c3ccb4", radius: "10px",
			fontBody: "manrope",
			fontDisplay: "dm-serif",
			fontSizeBase: "16px",
			borderWidth: "1px",
			shadow: "flat",
			maxWidth: "1140px",
			sectionPad: "7rem 0",
			pattern: "dots",
		},
		dark: {
			brand: "#86b48e", brandStrong: "#5d8a64", brandSoft: "#1e2f23",
			accent: "#d9a441", accentSoft: "#3a2f16",
			bg: "#10170f", surface: "#1a231b", text: "#e9f0e4", muted: "#93a08d",
			border: "#2a362b", radius: "10px",
			fontBody: "manrope",
			fontDisplay: "dm-serif",
			fontSizeBase: "16px",
			borderWidth: "1px",
			shadow: "flat",
			maxWidth: "1140px",
			sectionPad: "7rem 0",
			pattern: "dots",
		},
	},
	{
		id: "ocean",
		name: "Ocean",
		description: "Deep sea blue with foam highlights. Clean and confident.",
		isPreset: true,
		schema: DESIGN_SCHEMA,
		light: {
			brand: "#0c5fa8", brandStrong: "#084a86", brandSoft: "#c9e2f5",
			accent: "#0e7c7b", accentSoft: "#c9e9e7",
			bg: "#e3eef7", surface: "#d0e1ef", text: "#10293f", muted: "#5a6f82",
			border: "#b9cfe0", radius: "18px",
			fontBody: "inter",
			fontDisplay: "space-grotesk",
			fontSizeBase: "17px",
			borderWidth: "1.5px",
			shadow: "bold",
			maxWidth: "1280px",
			sectionPad: "9rem 0",
			pattern: "grid",
		},
		dark: {
			brand: "#5aa9e6", brandStrong: "#2f7fc1", brandSoft: "#12395c",
			accent: "#4cc9c0", accentSoft: "#123f3c",
			bg: "#0d1620", surface: "#16222e", text: "#e8f1f8", muted: "#8fa2b3",
			border: "#243647", radius: "18px",
			fontBody: "inter",
			fontDisplay: "space-grotesk",
			fontSizeBase: "17px",
			borderWidth: "1.5px",
			shadow: "bold",
			maxWidth: "1280px",
			sectionPad: "9rem 0",
			pattern: "grid",
		},
	},
];

/** Render a design record as a stylesheet both color schemes. */
export function renderThemeCss(d: DesignRecord): string {
	const families = new Set<string>();
	const fontFor = (key: string, fallback: string) => {
		const f = FONTS[key] ?? FONTS[fallback]!;
		if (f.google) families.add(f.google);
		return f.stack;
	};
	// Collect from both modes so a single @import covers light + dark.
	for (const t of [d.light, d.dark]) {
		fontFor(t.fontBody, "inter");
		fontFor(t.fontDisplay, "fraunces");
	}
	const imports =
		families.size > 0
			? `@import url("https://fonts.googleapis.com/css2?family=${[...families]
					.map((f) => `${f.replace(/ /g, "+")}:wght@400;500;600;700`)
					.join("&family=")}&display=swap");\n`
			: "";
	const block = (t: DesignTokens) => {
		const sh = SHADOWS[t.shadow] ?? SHADOWS.soft!;
		return [
			`--color-brand:${t.brand};`,
			`--color-brand-strong:${t.brandStrong};`,
			`--color-brand-soft:${t.brandSoft};`,
			`--color-accent:${t.accent};`,
			`--color-accent-soft:${t.accentSoft};`,
			`--color-bg:${t.bg};`,
			`--color-surface:${t.surface};`,
			`--color-text:${t.text};`,
			`--color-muted:${t.muted};`,
			`--color-border:${t.border};`,
			`--radius:${t.radius};`,
			`--radius-lg:calc(${t.radius} + 8px);`,
			`--font-body:${fontFor(t.fontBody, "inter")};`,
			`--font-heading:${fontFor(t.fontDisplay, "fraunces")};`,
			`--font-size-base:${t.fontSizeBase};`,
			`--shadow-sm:${sh.sm};`,
			`--shadow-lg:${sh.lg};`,
			`--shadow-xl:${sh.xl};`,
			`--wide-width:${t.maxWidth};`,
		].join("");
	};
	return (
		`/* Sella design: ${d.name} (${d.id}) — generated, do not edit */\n` +
		imports +
		`html:root{${block(d.light)}}` +
		`.section{padding:${d.light.sectionPad};}` +
		`body{${patternCss(d.light.pattern)}}` +
		`\nhtml:root.dark{${block(d.dark)}}` +
		`html:root.dark .section{padding:${d.dark.sectionPad};}` +
		`html:root.dark body{${patternCss(d.dark.pattern)}}` +
		`\n@media (prefers-color-scheme: dark){html:root:not(.light){${block(d.dark)}}` +
		`html:root:not(.light) .section{padding:${d.dark.sectionPad};}` +
		`html:root:not(.light) body{${patternCss(d.dark.pattern)}}}` +
		`\n`
	);
}
