import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isTrusted } from "main/lib/workspace-trust";
import {
	CONFIG_FILE_NAME,
	PROJECT_ROSTER_DIR_NAME,
	PROJECTS_DIR_NAME,
	ROSTER_DIR_NAME,
} from "shared/constants";
import type { SetupConfig } from "shared/types";

/**
 * Worktrees don't include gitignored files, so copy .roster from main repo
 * if it's missing — ensures setup scripts like "./.roster/setup.sh" work.
 */
export function copyRosterConfigToWorktree(
	mainRepoPath: string,
	worktreePath: string,
): void {
	const mainRosterDir = join(mainRepoPath, PROJECT_ROSTER_DIR_NAME);
	const worktreeRosterDir = join(worktreePath, PROJECT_ROSTER_DIR_NAME);

	if (existsSync(mainRosterDir) && !existsSync(worktreeRosterDir)) {
		try {
			cpSync(mainRosterDir, worktreeRosterDir, { recursive: true });
		} catch (error) {
			console.error(
				`Failed to copy ${PROJECT_ROSTER_DIR_NAME} to worktree: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

function readConfigFile(configPath: string): SetupConfig | null {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as SetupConfig;

		if (parsed.setup && !Array.isArray(parsed.setup)) {
			throw new Error("'setup' field must be an array of strings");
		}

		if (parsed.teardown && !Array.isArray(parsed.teardown)) {
			throw new Error("'teardown' field must be an array of strings");
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readConfigFromPath(basePath: string): SetupConfig | null {
	return readConfigFile(
		join(basePath, PROJECT_ROSTER_DIR_NAME, CONFIG_FILE_NAME),
	);
}

/**
 * Resolves setup/teardown config with a three-tier priority:
 *   1. User override:  ~/.roster/projects/<projectId>/config.json
 *   2. Worktree:       <worktreePath>/.roster/config.json
 *   3. Main repo:      <mainRepoPath>/.roster/config.json
 *
 * First config found wins entirely (no merging between levels).
 */
export function loadSetupConfig({
	mainRepoPath,
	worktreePath,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): SetupConfig | null {
	if (projectId && !projectId.includes("/") && !projectId.includes("\\")) {
		const userConfigPath = join(
			homedir(),
			ROSTER_DIR_NAME,
			PROJECTS_DIR_NAME,
			projectId,
			CONFIG_FILE_NAME,
		);
		const config = readConfigFile(userConfigPath);
		if (config) {
			console.log(`[setup] Using user override config from ${userConfigPath}`);
			return config;
		}
	}

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			console.log(
				`[setup] Using worktree config from ${join(worktreePath, PROJECT_ROSTER_DIR_NAME, CONFIG_FILE_NAME)}`,
			);
			return config;
		}
	}

	const config = readConfigFromPath(mainRepoPath);
	if (config) {
		console.log(
			`[setup] Using main repo config from ${join(mainRepoPath, PROJECT_ROSTER_DIR_NAME, CONFIG_FILE_NAME)}`,
		);
	}
	return config;
}

export interface ResolvedSetupCommands {
	/**
	 * Setup commands the caller may auto-run in a PTY. Populated ONLY when the
	 * repo root is trusted — `null` otherwise. This is the security guarantee:
	 * an untrusted repo's setup commands never reach any renderer path that
	 * auto-runs `initialCommands`.
	 */
	initialCommands: string[] | null;
	/**
	 * Setup commands that exist but were withheld from auto-run because the repo
	 * root is not trusted. The renderer surfaces these in the trust prompt so the
	 * user can review them before opting in. `null` when trusted or absent.
	 */
	untrustedSetupCommands: string[] | null;
	/** Resolved (normalized) repo root — the workspace-trust allow-list key. */
	mainRepoRoot: string;
	/** Whether `mainRepoRoot` is on the trusted-roots allow-list right now. */
	trusted: boolean;
}

/**
 * Resolve a workspace's `.roster` setup commands AND the workspace-trust
 * decision in one place, in the MAIN process, so no renderer path can bypass
 * the gate.
 *
 * Invariant: `initialCommands` (the auto-run list) is non-null ONLY for trusted
 * roots. For an untrusted root the commands move to `untrustedSetupCommands`
 * (review-only) and `initialCommands` is `null`. At most one of the two is ever
 * populated.
 */
export function resolveSetupCommands({
	mainRepoPath,
	worktreePath,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): ResolvedSetupCommands {
	const setupConfig = loadSetupConfig({ mainRepoPath, worktreePath, projectId });
	const setup = setupConfig?.setup ?? null;
	// Match workspace-trust.ts normalization (resolve()) so the returned key is
	// the exact string the renderer hands back to setTrust / getTrust.
	const mainRepoRoot = resolve(mainRepoPath);
	const trusted = isTrusted(mainRepoRoot);

	const hasSetup = Array.isArray(setup) && setup.length > 0;
	if (!hasSetup) {
		return {
			initialCommands: null,
			untrustedSetupCommands: null,
			mainRepoRoot,
			trusted,
		};
	}

	if (trusted) {
		return {
			initialCommands: setup,
			untrustedSetupCommands: null,
			mainRepoRoot,
			trusted,
		};
	}

	return {
		initialCommands: null,
		untrustedSetupCommands: setup,
		mainRepoRoot,
		trusted,
	};
}
