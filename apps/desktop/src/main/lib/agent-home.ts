import { join } from "node:path";
import { getRosterHomeDir } from "./app-environment";

/**
 * Per-agent home directory layout (Roster).
 *
 * Each Agent (a `workspaces` row) owns a home dir under the app data dir:
 *
 *   <APP_DATA>/agents/<agentId>/
 *   ├── worktree/        the git repo/worktree; the CLI's cwd
 *   ├── memory/          canonical memory (source of truth, never committed)
 *   └── .codex/          Codex config + generated AGENTS.md (codex runtime only)
 *
 * Paths are DERIVED from the agent (workspace) id, not stored in the DB. See
 * docs/memory.md. `<APP_DATA>` is ROSTER_HOME_DIR (~/.roster[-<ws>]).
 */

/**
 * Root of the agents directory. Resolved lazily (per call) rather than captured
 * in a module-level const so a late ADE_HOME_DIR override still routes paths
 * correctly — see getRosterHomeDir in app-environment.ts.
 */
function agentsDir(): string {
	return join(getRosterHomeDir(), "agents");
}

/** Root of an agent's home directory. */
export function getAgentHome(agentId: string): string {
	return join(agentsDir(), agentId);
}

/** The agent's git worktree (the runtime CLI's cwd). */
export function getAgentWorktreePath(agentId: string): string {
	return join(getAgentHome(agentId), "worktree");
}

/** The agent's canonical memory directory. */
export function getAgentMemoryDir(agentId: string): string {
	return join(getAgentHome(agentId), "memory");
}

/** CODEX_HOME for a codex-runtime agent (isolates its config/history). */
export function getAgentCodexHome(agentId: string): string {
	return join(getAgentHome(agentId), ".codex");
}

/**
 * The SHARED user profile, canonical across ALL agents:
 * <ROSTER_HOME_DIR>/memory/USER.md. Who the user is doesn't vary per agent, so
 * a preference learned by one agent benefits every agent. Agent-specific notes
 * belong in that agent's memory/MEMORY.md instead. See docs/memory.md.
 */
export function getSharedUserProfilePath(): string {
	return join(getRosterHomeDir(), "memory", "USER.md");
}
