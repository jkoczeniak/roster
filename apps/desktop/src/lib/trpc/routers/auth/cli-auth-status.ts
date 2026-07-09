import { execWithShellEnv } from "../workspaces/utils/shell-env";

/**
 * Probes the login state of the CLIs that agents inherit credentials from
 * (see docs/authentication.md — Roster stores no credentials itself).
 *
 * Only derived status strings ever leave this module: parsers extract
 * account names / auth methods from CLI output and never return raw output,
 * so tokens (even masked ones, as in `gh auth status`) cannot leak to the UI.
 */

export type CliAuthCli = "claude" | "codex" | "github";

export type CliAuthState =
	| "authenticated"
	| "unauthenticated"
	| "not_installed"
	| "unknown";

export interface CliAuthStatus {
	cli: CliAuthCli;
	displayName: string;
	state: CliAuthState;
	/** Human-readable account info (email, username, auth method). Never a token. */
	detail: string | null;
}

const PROBE_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30_000;

interface ProbeResult {
	stdout: string;
	stderr: string;
	failed: boolean;
	notInstalled: boolean;
}

async function runCli(cmd: string, args: string[]): Promise<ProbeResult> {
	try {
		const { stdout, stderr } = await execWithShellEnv(cmd, args, {
			timeout: PROBE_TIMEOUT_MS,
		});
		return { stdout, stderr, failed: false, notInstalled: false };
	} catch (error) {
		// execFile errors carry the child's output; a non-zero exit still often
		// includes a parseable status message (e.g. "Not logged in").
		const err = error as NodeJS.ErrnoException & {
			stdout?: string;
			stderr?: string;
		};
		return {
			stdout: typeof err.stdout === "string" ? err.stdout : "",
			stderr: typeof err.stderr === "string" ? err.stderr : "",
			failed: true,
			notInstalled: err.code === "ENOENT",
		};
	}
}

/**
 * Parses `claude auth status --json` output. Newer Claude Code CLIs emit
 * JSON like {"loggedIn":true,"authMethod":"claude.ai","email":"..."}; older
 * ones don't have the `auth` subcommand at all, which we report as unknown.
 */
export function parseClaudeAuthStatus(result: ProbeResult): CliAuthStatus {
	const base = { cli: "claude" as const, displayName: "Claude Code" };
	if (result.notInstalled) {
		return { ...base, state: "not_installed", detail: null };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		return {
			...base,
			state: "unknown",
			detail: "Installed, but this CLI version can't report login status",
		};
	}

	if (typeof parsed !== "object" || parsed === null) {
		return { ...base, state: "unknown", detail: null };
	}
	const status = parsed as {
		loggedIn?: unknown;
		email?: unknown;
		authMethod?: unknown;
		subscriptionType?: unknown;
	};
	if (typeof status.loggedIn !== "boolean") {
		return { ...base, state: "unknown", detail: null };
	}
	if (!status.loggedIn) {
		return { ...base, state: "unauthenticated", detail: null };
	}

	const parts: string[] = [];
	if (typeof status.email === "string" && status.email) {
		parts.push(status.email);
	}
	if (typeof status.authMethod === "string" && status.authMethod) {
		parts.push(
			typeof status.subscriptionType === "string" && status.subscriptionType
				? `${status.authMethod} (${status.subscriptionType})`
				: status.authMethod,
		);
	}
	return {
		...base,
		state: "authenticated",
		detail: parts.length > 0 ? parts.join(" · ") : null,
	};
}

/**
 * Parses `codex login status` output: "Logged in using ChatGPT" /
 * "Logged in using an API key" on success, "Not logged in" otherwise.
 */
export function parseCodexLoginStatus(result: ProbeResult): CliAuthStatus {
	const base = { cli: "codex" as const, displayName: "Codex" };
	if (result.notInstalled) {
		return { ...base, state: "not_installed", detail: null };
	}

	const output = `${result.stdout}\n${result.stderr}`;
	if (/not logged in/i.test(output)) {
		return { ...base, state: "unauthenticated", detail: null };
	}
	const loggedIn = output.match(/logged in (?:using|with) (.+)/i);
	if (loggedIn) {
		const method = loggedIn[1].trim().replace(/^an? /i, "");
		return { ...base, state: "authenticated", detail: `via ${method}` };
	}
	return { ...base, state: "unknown", detail: null };
}

/**
 * Parses `gh auth status` output: exit 0 with "Logged in to <host> account
 * <user>" per host, or a non-zero exit with "not logged in". Older gh
 * versions write status to stderr, so both streams are considered.
 */
export function parseGhAuthStatus(result: ProbeResult): CliAuthStatus {
	const base = { cli: "github" as const, displayName: "GitHub CLI" };
	if (result.notInstalled) {
		return { ...base, state: "not_installed", detail: null };
	}

	const output = `${result.stdout}\n${result.stderr}`;
	const loggedIn = output.match(/logged in to (\S+) account (\S+)/i);
	if (loggedIn && !result.failed) {
		return {
			...base,
			state: "authenticated",
			detail: `${loggedIn[2]} on ${loggedIn[1]}`,
		};
	}
	if (/not logged in/i.test(output)) {
		return { ...base, state: "unauthenticated", detail: null };
	}
	// Partial failures (e.g. one host's token expired) still report accounts.
	if (loggedIn) {
		return {
			...base,
			state: "authenticated",
			detail: `${loggedIn[2]} on ${loggedIn[1]}`,
		};
	}
	return { ...base, state: "unknown", detail: null };
}

let cache: { data: CliAuthStatus[]; timestamp: number } | null = null;
let inFlight: Promise<CliAuthStatus[]> | null = null;

async function probeAll(): Promise<CliAuthStatus[]> {
	const [claude, codex, github] = await Promise.all([
		runCli("claude", ["auth", "status", "--json"]),
		runCli("codex", ["login", "status"]),
		runCli("gh", ["auth", "status"]),
	]);
	return [
		parseClaudeAuthStatus(claude),
		parseCodexLoginStatus(codex),
		parseGhAuthStatus(github),
	];
}

/**
 * Returns the auth status of all agent CLIs, cached briefly so the settings
 * UI doesn't spawn processes on every render.
 */
export async function getCliAuthStatuses(options?: {
	forceRefresh?: boolean;
}): Promise<CliAuthStatus[]> {
	if (
		!options?.forceRefresh &&
		cache &&
		Date.now() - cache.timestamp < CACHE_TTL_MS
	) {
		return cache.data;
	}
	if (!inFlight) {
		inFlight = probeAll()
			.then((data) => {
				cache = { data, timestamp: Date.now() };
				return data;
			})
			.finally(() => {
				inFlight = null;
			});
	}
	return inFlight;
}

/** Clears the status cache (for tests). */
export function clearCliAuthStatusCache(): void {
	cache = null;
}
