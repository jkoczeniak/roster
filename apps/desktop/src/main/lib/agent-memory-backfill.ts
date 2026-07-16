import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { workspaces, worktrees } from "@roster/local-db";
import { eq, isNotNull } from "drizzle-orm";
import { getAgentMemoryDir } from "./agent-home";
import { scaffoldAgentMemory } from "./agent-scaffold";
import { resolveAgentWorktreePath } from "./agent-worktree";
import { MEMORY_SCAFFOLD_ENABLED } from "./feature-flags";
import { localDb } from "./local-db";
import { getUserName } from "./user-profile";

/**
 * Launch-time pass that brings every agent's scaffold up to spec
 * (docs/memory.md): seeds missing canonical files for agents created while
 * ADE_MEMORY_SCAFFOLD was off, AND refreshes machine-owned runtime artifacts
 * (reflect-on-stop hook, bridge symlinks, legacy-bridge migration) for agents
 * that are already scaffolded — this pass is how existing agents pick up
 * generated-artifact fixes.
 *
 * Conservative + idempotent by construction:
 * - Only touches Roster agents (workspaces.runtime set) whose repo is already set
 *   up (worktree/.git exists). A still-initializing or failed agent is left to
 *   its own init job.
 * - Delegates to scaffoldAgentMemory: user-owned files (memory/*.md, USER.md,
 *   .claude/settings.json, a customized CLAUDE.md bridge) are write-if-missing
 *   and never overwritten — including files the user deliberately emptied.
 *   Machine-owned artifacts (reflect-on-stop.mjs, an UNTOUCHED legacy bridge)
 *   are regenerated/migrated in place.
 * - Per-agent try/catch so one bad agent never blocks the others or app launch.
 */
export function backfillAgentMemory(): void {
	if (!MEMORY_SCAFFOLD_ENABLED) return;

	let agents: Array<typeof workspaces.$inferSelect>;
	try {
		agents = localDb
			.select()
			.from(workspaces)
			.where(isNotNull(workspaces.runtime))
			.all();
	} catch (error) {
		console.error("[memory-backfill] Failed to list agents:", error);
		return;
	}

	const userName = getUserName();
	let scaffolded = 0;

	for (const agent of agents) {
		try {
			if (!agent.runtime || agent.deletingAt) continue;

			// Resolve the agent's REAL worktree from its DB row. The derived
			// <agent-home>/worktree is correct for the standard flow, but a
			// local-path agent's worktree is an external repo stored on its
			// worktrees row — using the derived path would skip it (no .git there)
			// and, worse, drop bridges into a non-existent dir. Fall back to the
			// derived path when the row has none.
			const worktreePath = resolveAgentWorktreePath(agent.id, agent.worktreeId);
			// Folder agents (vcs === "none") have a worktree with no .git — they
			// still get the scaffold, with the git-free prompt variant.
			const worktree = agent.worktreeId
				? localDb
						.select()
						.from(worktrees)
						.where(eq(worktrees.id, agent.worktreeId))
						.get()
				: undefined;
			const vcs = worktree?.vcs ?? "git";
			// The workspace must already be set up: a git agent needs its repo, a
			// folder agent just its directory. This guard also filters out any
			// non-Roster workspace that happens to carry a runtime value.
			if (vcs === "none") {
				if (!existsSync(worktreePath)) continue;
			} else if (!existsSync(join(worktreePath, ".git"))) {
				continue;
			}

			const isFirstScaffold = memoryDirIsEmpty(getAgentMemoryDir(agent.id));

			scaffoldAgentMemory({
				agentId: agent.id,
				agentName: agent.name || "Agent",
				runtime: agent.runtime,
				userName,
				worktreePath,
				vcs,
			});
			if (isFirstScaffold) scaffolded++;
		} catch (error) {
			console.error(`[memory-backfill] Failed for ${agent.id}:`, error);
		}
	}

	if (scaffolded > 0) {
		console.log(
			`[memory-backfill] Scaffolded memory for ${scaffolded} agent(s).`,
		);
	}
}

/**
 * A memory dir "needs scaffolding" when it is missing or holds no non-empty
 * markdown file. Any non-empty *.md (AGENT/USER/MEMORY, the write-back
 * protocol, or a hand-written topic file) means the agent is already set up.
 */
function memoryDirIsEmpty(dir: string): boolean {
	if (!existsSync(dir)) return true;
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return true;
	}
	for (const name of entries) {
		if (!name.endsWith(".md")) continue;
		try {
			if (statSync(join(dir, name)).size > 0) return false;
		} catch {
			// Unreadable entry — ignore and keep looking.
		}
	}
	return true;
}
