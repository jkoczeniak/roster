/**
 * Environment variables for the RENDERER PROCESS (browser context).
 *
 * These values are injected at BUILD TIME by Vite's `define` in electron.vite.config.ts.
 * They are NOT read from process.env at runtime - Vite replaces the references with
 * literal strings during compilation.
 *
 * Only import this file in src/renderer/ code - never in main or shared code.
 *
 * For main process env vars, use src/main/env.main.ts instead.
 */
import { z } from "zod/v4";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	// Retained for the local desktop-version check + IPC cache origin. Points at a
	// non-routable placeholder host in local-only builds; no telemetry endpoints.
	NEXT_PUBLIC_API_URL: z.url().default("https://api.roster.local"),
});

/**
 * Build-time environment variables.
 *
 * Vite replaces these process.env.* and import.meta.env.* references at build time.
 * The values are baked into the bundle as string literals.
 */
const rawEnv = {
	// These are replaced by Vite's define at build time
	NODE_ENV: process.env.NODE_ENV,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
};

// Local build: always skip cloud validation (fully local)
const SKIP_ENV_VALIDATION = true;

export const env = {
	...(SKIP_ENV_VALIDATION
		? (rawEnv as z.infer<typeof envSchema>)
		: envSchema.parse(rawEnv)),
	SKIP_ENV_VALIDATION,
};
