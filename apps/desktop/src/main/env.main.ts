/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// Retained for the local desktop-version check + IPC cache origin. Points
		// at a non-routable placeholder host in local-only builds.
		NEXT_PUBLIC_API_URL: z.url().default("https://api.roster.local"),
	},

	runtimeEnv: {
		...process.env,
		// Explicitly list env vars so Vite can replace them at build time
		// (spreading process.env only works at runtime, not for bundled apps)
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	},
	emptyStringAsUndefined: true,
	// Local build: always skip cloud validation (fully local)
	skipValidation: true,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
