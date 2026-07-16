import type { AgentRuntime, TerminalPreset } from "@roster/local-db";
import type { AgentBinary, CheckedBinary } from "@roster/shared/agent-binaries";
import { RUNTIME_BINARY } from "@roster/shared/agent-binaries";
import {
	AGENT_LABELS,
	buildRuntimeCommand,
	DEFAULT_PERMISSION_MODE,
	type PermissionMode,
} from "@roster/shared/agent-command";
import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRuntimeAvailability } from "renderer/stores/model-bar/useRuntimeAvailability";
import { useTabsWithPresets } from "./useTabsWithPresets";

/** Minimal shape needed to spawn an agent's runtime CLI session. */
export interface AgentSessionWorkspace {
	id: string;
	runtime?: AgentRuntime | null;
	worktreePath?: string | null;
	/** Per-agent permission override; null/undefined = inherit the global default. */
	permissionMode?: PermissionMode | null;
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
 * (via buildRuntimeCommand, honoring the agent's permission override — falling
 * back to the global default — and an optional
 * model variant) in the agent's worktree and open it as a new tab. When the
 * agent has no runtime we fall back to a plain shell tab.
 *
 * Spawning is gated on the runtime's binary being installed: when it's missing,
 * spawnAgentSession returns null and sets `missingBinary` instead of opening a
 * terminal that would just print a wrapper error. Callers render
 * BinaryInstallDialog from the returned dialog fields. While availability is
 * still unknown (probe in flight) we assume available so a slow probe never
 * blocks spawning.
 */
export function useAgentSession() {
	const { openPreset, addTab } = useTabsWithPresets();
	// Global default posture (Settings → Behavior → Default agent autonomy).
	// A workspace's permissionMode overrides it per-agent. Defaults to guarded
	// while loading so a race can never grant full autonomy.
	const { data: permissionMode } =
		electronTrpc.settings.getPermissionMode.useQuery();
	const globalMode = permissionMode ?? DEFAULT_PERMISSION_MODE;

	const { availability, recheck, isFetching } = useRuntimeAvailability();
	const [missingBinary, setMissingBinary] = useState<AgentBinary | null>(null);

	// Close the install dialog once a re-check confirms the tool is now present.
	useEffect(() => {
		if (
			missingBinary &&
			(availability?.[missingBinary as CheckedBinary] ?? true)
		) {
			setMissingBinary(null);
		}
	}, [missingBinary, availability]);

	const spawnAgentSession = useCallback(
		(
			workspace: AgentSessionWorkspace,
			variant?: AgentSessionVariant,
			options?: {
				/** Submitted as the session's first prompt (new-agent introduction). */
				initialPrompt?: string;
			},
		) => {
			const { id, runtime, worktreePath } = workspace;
			const cwd = worktreePath || undefined;
			// Per-agent override wins; absent/null inherits the global default.
			const mode = workspace.permissionMode ?? globalMode;

			if (!runtime) {
				// No runtime configured — open a plain shell in the worktree.
				return addTab(id, { initialCwd: cwd });
			}

			// Availability gate: the runtime's binary must be present before
			// spawning. Unknown (probe unresolved) counts as available.
			const binary = RUNTIME_BINARY[runtime];
			if (!(availability?.[binary as CheckedBinary] ?? true)) {
				setMissingBinary(binary);
				return null;
			}

			const command = buildRuntimeCommand({
				runtime,
				mode,
				model: variant?.model ?? null,
				reasoningEffort: variant?.reasoningEffort,
				initialPrompt: options?.initialPrompt,
			});

			const preset: TerminalPreset = {
				id: variant
					? `agent-${runtime}-${variant.id ?? variant.label.toLowerCase()}`
					: `agent-${runtime}`,
				// The default variant's label equals the runtime label ("Claude") —
				// don't render it twice ("Claude Claude").
				name:
					variant && variant.label !== AGENT_LABELS[runtime]
						? `${AGENT_LABELS[runtime]} ${variant.label}`
						: AGENT_LABELS[runtime],
				cwd: worktreePath ?? "",
				commands: [command],
				executionMode: "new-tab",
			};

			return openPreset(id, preset, { target: "new-tab" });
		},
		[openPreset, addTab, globalMode, availability],
	);

	const dismissMissingBinary = useCallback(() => setMissingBinary(null), []);

	return {
		spawnAgentSession,
		/** Binary that blocked the last spawn (drives BinaryInstallDialog). */
		missingBinary,
		dismissMissingBinary,
		/** Re-probe availability; wire to BinaryInstallDialog's onRecheck. */
		recheckAvailability: recheck,
		isRecheckingAvailability: isFetching,
	};
}
