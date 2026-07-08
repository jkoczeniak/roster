import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	getRosterHomeDir,
	ROSTER_HOME_DIR_MODE,
	ROSTER_SENSITIVE_FILE_MODE,
} from "../app-environment";

/**
 * Shared secret that gates the local notification/hook HTTP server.
 *
 * The server runs on loopback but is reachable by ANY local process (and, via a
 * malicious page in the built-in browser + DNS rebinding, potentially by web
 * content). Since POST /agent/invoke can spawn a terminal and run an arbitrary
 * agent prompt, every request must carry this token in the `x-roster-token`
 * header. It is the single source of truth shared by:
 *   - the notification server middleware (validates the header), and
 *   - the agent terminal env (injected as ROSTER_HOOK_TOKEN so the notify hook
 *     script and any in-terminal caller can authenticate).
 *
 * Mirrors the terminal-host token pattern: 32 random bytes, hex-encoded,
 * persisted to <ROSTER_HOME_DIR>/notifications.token with mode 0o600 and reused
 * across restarts.
 */
const TOKEN_FILE_NAME = "notifications.token";

let cachedToken: string | null = null;

function tokenPath(): string {
	return join(getRosterHomeDir(), TOKEN_FILE_NAME);
}

/**
 * Return the notification server token, generating and persisting it on first
 * use. Cached in-memory for the lifetime of the process.
 */
export function getNotificationToken(): string {
	if (cachedToken) return cachedToken;

	const path = tokenPath();

	if (existsSync(path)) {
		const existing = readFileSync(path, "utf-8").trim();
		if (existing) {
			cachedToken = existing;
			return existing;
		}
	}

	// Ensure the token file's own directory exists (resolved dynamically so it
	// tracks ADE_HOME_DIR rather than a snapshot taken at import time).
	mkdirSync(dirname(path), { recursive: true, mode: ROSTER_HOME_DIR_MODE });
	const token = randomBytes(32).toString("hex");
	writeFileSync(path, token, { mode: ROSTER_SENSITIVE_FILE_MODE });
	cachedToken = token;
	return token;
}
