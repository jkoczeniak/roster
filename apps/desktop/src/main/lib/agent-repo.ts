import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { VcsKind } from "@roster/local-db";
import simpleGit from "simple-git";
import {
	getAgentHome,
	getAgentMemoryDir,
	getAgentWorktreePath,
} from "./agent-home";

/**
 * Reject clone sources that let a repo URL turn into local command execution or
 * git-option injection. simple-git's `clone` forwards the source straight to
 * `git clone <url>` with no `--` separator, so the string is the only guard:
 *
 *   - `ext::sh -c '…'`  → git's ext:: remote-helper runs an arbitrary command
 *   - `fd::` / `file::` → other remote-helper transports (`<scheme>::` syntax)
 *   - a leading `-`     → the "url" is parsed as a git option (arg injection)
 *
 * We therefore allow-list the shapes we actually support and reject the rest:
 *   - https:// http:// ssh:// git:// git+ssh://
 *   - file:// with an absolute path (local clone)
 *   - scp-like `user@host:path` (no leading dash)
 *   - an absolute local filesystem path that exists as a directory
 */
export function assertSafeCloneUrl(url: string): void {
	const value = url.trim();

	if (!value) {
		throw new Error("Clone URL must not be empty.");
	}

	// Leading dash → git would treat the source as an option.
	if (value.startsWith("-")) {
		throw new Error(`Refusing to clone from a source that starts with "-": ${value}`);
	}

	// Absolute local path (local clone) — must exist as a directory.
	if (value.startsWith("/")) {
		if (existsSync(value) && statSync(value).isDirectory()) {
			return;
		}
		throw new Error(
			`Local clone path does not exist or is not a directory: ${value}`,
		);
	}

	// Standard network / file transports we support.
	if (/^(https|http|ssh|git|git\+ssh):\/\//i.test(value)) {
		return;
	}
	if (/^file:\/\/\//.test(value)) {
		return;
	}

	// scp-like syntax: user@host:path (host may be an IP/name; path is required).
	// Excludes remote-helper syntax (`scheme::…`) handled by the reject below.
	const scpMatch = /^([\w.-]+)@([\w.-]+):.+/.exec(value);
	if (scpMatch && !/::/.test(value)) {
		const [, user, host] = scpMatch;
		// A user/host segment beginning with "-" is parsed by ssh as an option
		// (e.g. `git@-oProxyCommand=x:path`), so reject it defense-in-depth even
		// though a whole-string leading dash is already rejected above.
		if (user.startsWith("-") || host.startsWith("-")) {
			throw new Error(
				`Refusing to clone from an scp-like source whose user or host starts with "-": ${value}`,
			);
		}
		return;
	}

	// Any `<scheme>::` prefix is a git remote-helper transport (ext::, fd::,
	// file::, …) — the primary code-execution vector. Reject explicitly.
	if (/^[a-z0-9+.-]*::/i.test(value)) {
		throw new Error(
			`Refusing to clone from a git remote-helper transport (scheme "::"): ${value}`,
		);
	}

	throw new Error(`Unsupported or unsafe clone URL: ${value}`);
}

/**
 * How an agent's repo is populated at creation time.
 * - init:   a fresh empty git repo (`git init` + empty initial commit)
 * - clone:  clone a remote URL or a local path into the worktree
 * - folder: a plain directory with NO git repo ("Folder (no git)")
 */
export type AgentRepoSource =
	| { type: "init" }
	| { type: "clone"; url: string }
	| { type: "folder" };

export interface AgentRepoResult {
	agentHome: string;
	worktreePath: string;
	memoryDir: string;
	branch: string;
	/** "git" for init/clone, "none" for a folder agent. */
	vcs: VcsKind;
}

/**
 * Build an Agent's standalone repo + home layout on disk (Roster Phase B, risk #1).
 *
 * Unlike the shared-repo model (`git worktree add` off a project's
 * mainRepoPath), each Roster agent owns its OWN git repo at
 * <agent-home>/worktree. The canonical `memory/` dir is created as a sibling
 * (templates are written later, in the Phase E scaffolder). Returns the paths
 * and the checked-out branch so the caller can persist a `worktrees` row.
 */
export async function setupAgentRepo({
	agentId,
	source,
}: {
	agentId: string;
	source: AgentRepoSource;
}): Promise<AgentRepoResult> {
	const agentHome = getAgentHome(agentId);
	const worktreePath = getAgentWorktreePath(agentId);
	const memoryDir = getAgentMemoryDir(agentId);

	// Create the memory dir (this also creates <agent-home>). worktree/ is
	// created below by init/clone/folder.
	mkdirSync(memoryDir, { recursive: true });

	// Folder agent ("Folder (no git)"): a plain directory with NO git repo. We
	// skip every simpleGit call — no init, no revparse, no retry-guard reading
	// `.git` — and hand back an empty branch + vcs:"none". mkdirSync is
	// idempotent, so this is safe to re-run on a retry.
	if (source.type === "folder") {
		mkdirSync(worktreePath, { recursive: true });
		return { agentHome, worktreePath, memoryDir, branch: "", vcs: "none" };
	}

	// Retry-safety: if a valid repo already exists (previous attempt got this
	// far), reuse it. If a partial/non-repo dir exists, clear it so init/clone
	// starts clean.
	if (existsSync(join(worktreePath, ".git"))) {
		const branch =
			(
				await simpleGit(worktreePath)
					.revparse(["--abbrev-ref", "HEAD"])
					.catch(() => "main")
			).trim() || "main";
		return { agentHome, worktreePath, memoryDir, branch, vcs: "git" };
	}
	if (existsSync(worktreePath)) {
		rmSync(worktreePath, { recursive: true, force: true });
	}

	let branch: string;
	if (source.type === "clone") {
		// Guard against ext::/argument injection before handing the URL to git.
		assertSafeCloneUrl(source.url);
		await simpleGit().clone(source.url, worktreePath);
		branch =
			(await simpleGit(worktreePath)
				.revparse(["--abbrev-ref", "HEAD"])
				.catch(() => "main")) || "main";
		branch = branch.trim();
	} else {
		mkdirSync(worktreePath, { recursive: true });
		const git = simpleGit(worktreePath);
		try {
			await git.init(["--initial-branch=main"]);
		} catch {
			await git.init();
		}
		// Set a local identity so the empty initial commit works even when the
		// machine has no global git user configured. Fresh agent repos are
		// standalone, so a local identity is appropriate.
		await git.addConfig("user.name", "Roster Agent", false, "local");
		await git.addConfig("user.email", "agent@ade.local", false, "local");
		await git.raw(["commit", "--allow-empty", "-m", "Initial commit"]);
		branch =
			(await git
				.revparse(["--abbrev-ref", "HEAD"])
				.catch(() => "main")) || "main";
		branch = branch.trim();
	}

	return { agentHome, worktreePath, memoryDir, branch, vcs: "git" };
}
