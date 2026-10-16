#!/usr/bin/env node
/**
 * create-sella — scaffold a complete store in one command:
 *   1. stock EmDash site (marketing template, node platform)
 *   2. install @sella/core
 *   3. overlay @sella/theme storefront files
 *
 * Usage:
 *   npm create @sella/create@latest my-shop [-- --pm pnpm]
 *   node index.mjs my-shop --pm npm --core file:../core --theme ../theme
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = "0.1.0";

function arg(name, fallback = null) {
	const i = process.argv.indexOf(name);
	if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
	const eq = process.argv.find((a) => a.startsWith(name + "="));
	if (eq) return eq.slice(name.length + 1);
	return fallback;
}

async function prompt(question, fallback) {
	if (process.argv.includes("--yes") && fallback !== undefined) return fallback;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolveQ) => {
		rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `, (answer) => {
			rl.close();
			resolveQ(answer.trim() || fallback || "");
		});
	});
}

function run(cmd, cwd, extraEnv = {}) {
	console.log(`  $ ${cmd}`);
	execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

function fail(msg) {
	console.error(`\n✕ ${msg}`);
	process.exit(1);
}

async function main() {
	console.log(`\n  — NORTHWIND COMMERCE v${VERSION} —\n  Raw EmDash + plugin = store.\n`);

	const name = process.argv[2]?.startsWith("--") ? null : process.argv[2];
	const dirName = (await prompt("Project directory", name || "my-sella-shop")).trim();
	if (!dirName || /[^\w.-]/.test(dirName)) fail("Directory must be a simple name (letters, numbers, -, _, .).");
	const target = resolve(process.cwd(), dirName);
	if (existsSync(target)) fail(`${target} already exists.`);

	const pm = (arg("--pm") || (await prompt("Package manager (npm/pnpm/yarn/bun)", "npm"))).toLowerCase();
	if (!["npm", "pnpm", "yarn", "bun"].includes(pm)) fail(`Unknown package manager: ${pm}`);
	const createCmd = { npm: "npm create", pnpm: "pnpm create", yarn: "yarn create", bun: "bun create" }[pm];

	// Theme source: published package, or local path for development.
	const themeOpt = arg("--theme");
	const themeDir = themeOpt
		? resolve(process.cwd(), themeOpt)
		: join(HERE, "..", "theme");
	if (!existsSync(join(themeDir, "theme.json"))) {
		fail(`Theme not found at ${themeDir}. Install @sella/theme or pass --theme <path>.`);
	}
	const manifest = JSON.parse(readFileSync(join(themeDir, "theme.json"), "utf8"));

	// Core spec: registry version by default, file: path for local development.
	const coreOpt = arg("--core") || `@sella/core@${manifest.core ?? "^0.2.0"}`;

	console.log(`\n1/4 Scaffolding stock EmDash site (${manifest.base.template}/${manifest.base.platform})…`);
	run(`${createCmd} emdash@latest ${dirName} -- --template ${manifest.base.template} --platform ${manifest.base.platform} --pm ${pm} --yes --no-install`, process.cwd());

	console.log(`\n2/4 Installing ${coreOpt}…`);
	const addCmd = { npm: "npm install", pnpm: "pnpm add", yarn: "yarn add", bun: "bun add" }[pm];
	try {
		run(`${addCmd} ${coreOpt}`, target);
	} catch {
		// Fall back to a manual link (works around registry Arborist quirks).
		console.log("  install failed — linking manually…");
		const linkTarget = coreOpt.startsWith("file:") ? resolve(target, coreOpt.slice(5)) : null;
		if (!linkTarget || !existsSync(linkTarget)) {
			fail(`Could not install ${coreOpt}. For local development pass --core file:../core.`);
		}
		const { symlinkSync } = await import("node:fs");
		mkdirSync(join(target, "node_modules", "@sella"), { recursive: true });
		try {
			symlinkSync(linkTarget, join(target, "node_modules", "@sella", "core"), "dir");
		} catch {
			fail(`Could not link ${linkTarget}.`);
		}
		const pkgPath0 = join(target, "package.json");
		const pkg0 = JSON.parse(readFileSync(pkgPath0, "utf8"));
		pkg0.dependencies = pkg0.dependencies || {};
		pkg0.dependencies["@sella/core"] = coreOpt;
		const { writeFileSync } = await import("node:fs");
		writeFileSync(pkgPath0, JSON.stringify(pkg0, null, 2) + "\n");
	}

	console.log(`\n3/4 Overlaying storefront theme…`);
	for (const entry of manifest.copy) {
		const src = join(themeDir, entry);
		const dest = join(target, entry);
		if (!existsSync(src)) fail(`Theme entry missing: ${entry}`);
		cpSync(src, dest, { recursive: true });
		console.log(`  + ${entry}`);
	}
	// astro.config.mjs ships fully wired (plugin + fonts + node adapter).
	cpSync(join(themeDir, manifest.config), join(target, manifest.config));
	console.log(`  + ${manifest.config} (wired)`);
	// Extra runtime deps the theme needs beyond the stock template.
	const pkgPath = join(target, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	for (const [dep, range] of Object.entries(manifest.deps || {})) {
		if (!pkg.dependencies[dep]) pkg.dependencies[dep] = range;
	}
	const { writeFileSync } = await import("node:fs");
	writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

	// Sanity: the base must look like the template we designed against.
	for (const marker of ["src/pages", "src/live.config.ts", "seed/seed.json", "node_modules/@sella/core"]) {
		if (!existsSync(join(target, marker))) fail(`Base scaffold looks wrong (missing ${marker}). Aborting.`);
	}

	console.log(`\n4/4 Done! Next steps:`);
	console.log(`  cd ${dirName}`);
	console.log(`  ${pm === "npm" ? "npm install" : pm === "yarn" ? "yarn" : `${pm} install`}   # install dependencies`);
	console.log(`  ${pm === "npm" ? "npm run dev" : pm === "yarn" ? "yarn dev" : `${pm} dev`}       # open http://localhost:4321`);
	console.log(`  1. Complete the setup wizard at /_emdash/admin`);
	console.log(`  2. Admin → Sella → settings (Stripe keys, shipping)`);
	console.log(`  3. Add products in Content → Products, or run the plugin seed-demo route`);
	console.log(`\nDocs: https://github.com/sella/sella (TBD)`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
