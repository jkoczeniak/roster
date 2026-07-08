import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	getRosterHomeDir,
	ROSTER_HOME_DIR_MODE,
	ROSTER_SENSITIVE_FILE_MODE,
} from "./app-environment";

/**
 * Persisted "trusted folders" allow-list (VS Code Workspace Trust style).
 *
 * A repo's `.roster/config.json` can declare `setup` commands that run in a PTY
 * — outside the agent sandbox — the moment its workspace opens. That is arbitrary
 * code from a possibly-untrusted repo, so we only auto-run those commands for
 * repo roots the user has explicitly trusted. This module is the source of truth
 * for that decision: an array of absolute repo-root paths stored at
 * <ROSTER_HOME_DIR>/trusted-roots.json (mode 0o600, dir 0o700). It mirrors the
 * token.ts file-handling pattern (mkdir recursive, atomic-ish write via rename).
 */
const TRUSTED_ROOTS_FILE_NAME = "trusted-roots.json";

function trustedRootsPath(): string {
	return join(getRosterHomeDir(), TRUSTED_ROOTS_FILE_NAME);
}

/** Canonical form so `/repo` and `/repo/` compare equal. */
function normalizeRoot(root: string): string {
	return resolve(root);
}

function readTrustedRoots(): string[] {
	const path = trustedRootsPath();
	if (!existsSync(path)) {
		return [];
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((entry): entry is string => typeof entry === "string");
	} catch (error) {
		console.error(
			`[workspace-trust] Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

function writeTrustedRoots(roots: string[]): void {
	const path = trustedRootsPath();
	mkdirSync(dirname(path), { recursive: true, mode: ROSTER_HOME_DIR_MODE });
	// Atomic-ish write: write a temp sibling then rename over the target so a
	// crash mid-write can't leave a truncated allow-list.
	const tmpPath = `${path}.${process.pid}.tmp`;
	writeFileSync(tmpPath, JSON.stringify(roots, null, 2), {
		mode: ROSTER_SENSITIVE_FILE_MODE,
	});
	renameSync(tmpPath, path);
}

/** Every trusted repo root (absolute, normalized). */
export function listTrusted(): string[] {
	return readTrustedRoots().map(normalizeRoot);
}

/** Whether the user has trusted this repo root's `.roster` setup commands. */
export function isTrusted(root: string): boolean {
	const target = normalizeRoot(root);
	return listTrusted().includes(target);
}

/** Persist trust for a repo root (idempotent). */
export function trust(root: string): void {
	const target = normalizeRoot(root);
	const roots = listTrusted();
	if (roots.includes(target)) {
		return;
	}
	writeTrustedRoots([...roots, target]);
}
