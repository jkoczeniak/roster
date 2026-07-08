import type { AgentRuntime, TerminalPreset } from "@roster/local-db";
import {
	AGENT_LABELS,
	buildRuntimeCommand,
	DEFAULT_PERMISSION_MODE,
} from "@roster/shared/agent-command";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsWithPresets } from "./useTabsWithPresets";

/** Minimal shape needed to spawn an agent's runtime CLI session. */
export interface AgentSessionWorkspace {
	id: string;
	runtime?: AgentRuntime | null;
	worktreePath?: string | null;
}

/** A model variant to launch (see MODEL_VARIANTS); omit for the CLI default. */
export interface AgentSessionVariant {
	/** Stable variant id; keeps the synthetic preset id unique per variant. */
	id?: string;
	label: string;
	model: string | null;
	reasoningEffort?: "medium" | "high";
}

/**
 * Spawns an agent's runtime CLI in a new terminal session tab.
 *
 * A "session" is just a normal terminal tab. Given an agent (workspace) with a
 * runtime, we build a synthetic TerminalPreset that launches the runtime's CLI
 * (via buildRuntimeCommand, honoring the global permission mode and an optional
 * model variant) in the agent's worktree and open it as a new tab. When the
 * agent has no runtime we fall back to a plain shell tab.
 */
export function useAgentSession() {
	const { openPreset, addTab } = useTabsWithPresets();
	// Global permission posture (Settings → Features → Agent autonomy). Defaults
	// to guarded while loading so a race can never grant full autonomy.
	const { data: permissionMode } =
		electronTrpc.settings.getPermissionMode.useQuery();
	const mode = permissionMode ?? DEFAULT_PERMISSION_MODE;

	const spawnAgentSession = useCallback(
		(workspace: AgentSessionWorkspace, variant?: AgentSessionVariant) => {
			const { id, runtime, worktreePath } = workspace;
			const cwd = worktreePath || undefined;

			if (!runtime) {
				// No runtime configured — open a plain shell in the worktree.
				return addTab(id, { initialCwd: cwd });
			}

			const command = buildRuntimeCommand({
				runtime,
				mode,
				model: variant?.model ?? null,
				reasoningEffort: variant?.reasoningEffort,
			});

			const preset: TerminalPreset = {
				id: variant
					? `agent-${runtime}-${variant.id ?? variant.label.toLowerCase()}`
					: `agent-${runtime}`,
				name: variant
					? `${AGENT_LABELS[runtime]} ${variant.label}`
					: AGENT_LABELS[runtime],
				cwd: worktreePath ?? "",
				commands: [command],
				executionMode: "new-tab",
			};

			return openPreset(id, preset, { target: "new-tab" });
		},
		[openPreset, addTab, mode],
	);

	return { spawnAgentSession };
}
