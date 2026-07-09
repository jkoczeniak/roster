import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ForgeKind } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Extracts the hostname from a git remote URL.
 * Handles scheme URLs (https://, ssh://, git://) and scp-like syntax
 * (git@host:owner/repo.git).
 */
export function parseRemoteHost(remoteUrl: string): string | null {
	const url = remoteUrl.trim();
	if (!url) {
		return null;
	}

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
		try {
			const hostname = new URL(url).hostname;
			return hostname ? hostname.toLowerCase() : null;
		} catch {
			return null;
		}
	}

	// scp-like: [user@]host:path
	const scpMatch = url.match(/^(?:[^@\s]+@)?([^:/\s]+):\S/);
	if (scpMatch) {
		return scpMatch[1].toLowerCase();
	}

	return null;
}

/**
 * Detects which forge hosts a remote from its URL. Self-hosted instances are
 * matched by hostname substring — "gitlab.corp.example" or
 * "gitlab-flex.enterprise.com" count as GitLab, "github.mycorp.com" (GitHub
 * Enterprise) counts as GitHub. Anything else (Bitbucket, sr.ht, bare git
 * servers) is "unknown" so callers can hide PR affordances instead of erroring.
 */
export function detectForgeKind(remoteUrl: string): ForgeKind | "unknown" {
	const host = parseRemoteHost(remoteUrl);
	if (!host) {
		return "unknown";
	}
	if (host.includes("github")) {
		return "github";
	}
	if (host.includes("gitlab")) {
		return "gitlab";
	}
	return "unknown";
}

/**
 * Converts a git remote URL to the repo's browsable web URL
 * (https, credentials and trailing .git stripped).
 */
export function remoteUrlToWebUrl(remoteUrl: string): string | null {
	const url = remoteUrl.trim();
	if (!url) {
		return null;
	}

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
		try {
			const parsed = new URL(url);
			const path = parsed.pathname.replace(/\.git\/?$/, "").replace(/\/+$/, "");
			if (!parsed.hostname || !path || path === "/") {
				return null;
			}
			return `https://${parsed.hostname}${path}`;
		} catch {
			return null;
		}
	}

	const scpMatch = url.match(/^(?:[^@\s]+@)?([^:/\s]+):(\S+)/);
	if (scpMatch) {
		const path = scpMatch[2]
			.replace(/\.git\/?$/, "")
			.replace(/\/+$/, "")
			.replace(/^\/+/, "");
		if (!path) {
			return null;
		}
		return `https://${scpMatch[1].toLowerCase()}/${path}`;
	}

	return null;
}

export async function getOriginRemoteUrl(
	worktreePath: string,
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["-C", worktreePath, "remote", "get-url", "origin"],
			{ timeout: 10_000 },
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

const kindCache = new Map<
	string,
	{ kind: ForgeKind | "unknown"; timestamp: number }
>();
// A repo's origin host effectively never changes mid-session; the TTL only
// exists so a user who just added/fixed their remote isn't stuck on "unknown".
const KIND_CACHE_TTL_MS = 5 * 60_000;

/**
 * Resolves the forge kind for a worktree from its origin remote URL.
 * "unknown" covers unsupported hosts and repos with no origin remote.
 */
export async function getForgeKindForPath(
	worktreePath: string,
): Promise<ForgeKind | "unknown"> {
	const cached = kindCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < KIND_CACHE_TTL_MS) {
		return cached.kind;
	}

	const remoteUrl = await getOriginRemoteUrl(worktreePath);
	const kind = remoteUrl ? detectForgeKind(remoteUrl) : "unknown";
	kindCache.set(worktreePath, { kind, timestamp: Date.now() });
	return kind;
}

export function clearForgeKindCache(): void {
	kindCache.clear();
}
