import node from "@astrojs/node";
import react from "@astrojs/react";
import icon from "astro-iconset";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { postgres, sqlite } from "emdash/db";
import { sella } from "@sella/core";

/**
 * Standalone Sella — no Cloudflare anywhere.
 *
 * IMPORTANT: Astro evaluates this config at BUILD time and inlines the result
 * into the server bundle, so the database driver is a build-time decision:
 *
 *   docker build --build-arg DB_DRIVER=postgres .
 *
 * Credentials are resolved at RUNTIME: when the driver is postgres, no
 * connection string is baked in, so `pg` picks up PGHOST/PGPORT/PGUSER/
 * PGPASSWORD/PGDATABASE from the environment on first connect. The entrypoint
 * derives those from DATABASE_URL. Nothing secret ends up in the image.
 *
 * Storage: ./uploads by default. Set S3_* at build time to bake in the S3
 * adapter (it is only imported when configured, to keep the AWS SDK out of
 * default images).
 */
const driver = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();
const s3Bucket = process.env.S3_BUCKET?.trim();

// NOTE: this is baked at build time. The image sets SQLITE_PATH to the
// volume path so the app and the entrypoint's `emdash init` agree on the same
// file -- when these disagreed, the app wrote to ./data.db in the container's
// writable layer while the volume held an empty database, and every redeploy
// silently lost the store.
const database = driver === "postgres"
	? // No connection string: resolved from PG* env at runtime.
		postgres({})
	: sqlite({ url: process.env.SQLITE_PATH ?? "file:./data.db" });

const storage = s3Bucket
	? (await import("emdash/storage/s3")).s3({
			bucket: s3Bucket,
			endpoint: process.env.S3_ENDPOINT,
			region: process.env.S3_REGION ?? "auto",
			accessKeyId: process.env.S3_ACCESS_KEY_ID,
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
			publicUrl: process.env.S3_PUBLIC_URL,
		})
	: local({
			directory: process.env.UPLOADS_DIR ?? "./uploads",
			baseUrl: "/_emdash/api/media/file",
		});

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		icon({
			// Only ship the Phosphor icons the storefront actually references,
			// not the full @iconify-json/ph set.
			include: {
				ph: [
					"chart-bar",
					"check-circle",
					"clock",
					"cloud",
					"code",
					"currency-dollar",
					"envelope",
					"globe",
					"heart",
					"lifebuoy",
					"lightning",
					"lock",
					"shield-check",
					"sparkle",
					"star",
					"users-three",
				],
			},
		}),
		emdash({
			// EmDash injects a Google-hosted Noto Sans for its admin UI, which
			// makes every build depend on fonts.gstatic.com. `fonts: false`
			// turns that off; the admin falls back to system fonts.
			fonts: false,
			database,
			storage,
			// Commerce is core to Sella: this is always registered, never
			// optional. It is an EmDash plugin only so the same engine can also
			// be installed on a self-hosted EmDash site.
			plugins: [sella()],
		}),
	],
	fonts: [
	{
		provider: fontProviders.local(),
		name: "Sella Sans",
		cssVariable: "--font-body",
		fallbacks: ["sans-serif"],
		optimizedFallbacks: false,
		options: {
			variants: [
					{ weight: 400, style: "normal", src: ["public/fonts/inter-400.woff2"] },
					{ weight: 500, style: "normal", src: ["public/fonts/inter-500.woff2"] },
					{ weight: 600, style: "normal", src: ["public/fonts/inter-600.woff2"] },
					{ weight: 700, style: "normal", src: ["public/fonts/inter-700.woff2"] },
					{ weight: 800, style: "normal", src: ["public/fonts/inter-800.woff2"] }
			],
		},
	},
	{
		provider: fontProviders.local(),
		name: "Sella Serif",
		cssVariable: "--font-display",
		fallbacks: ["Georgia", "serif"],
		optimizedFallbacks: false,
		options: {
			variants: [
					{ weight: 400, style: "normal", src: ["public/fonts/fraunces-400.woff2"] },
					{ weight: 600, style: "normal", src: ["public/fonts/fraunces-600.woff2"] },
					{ weight: 700, style: "normal", src: ["public/fonts/fraunces-700.woff2"] },
					{ weight: 900, style: "normal", src: ["public/fonts/fraunces-900.woff2"] }
			],
		},
	},
	],
	devToolbar: { enabled: false },
});