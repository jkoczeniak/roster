/**
 * Model variants offered in the ModelBar launch row. The variants themselves
 * (runtime, label, model, reasoning effort) live in @roster/shared so the
 * launch-command builder and the UI stay in sync; this module only adds the
 * icon lookup used by getPresetIcon.
 */
import type { AgentType } from "@roster/shared/agent-command";

export type { ModelVariant } from "@roster/shared/agent-command";
export { MODEL_VARIANTS } from "@roster/shared/agent-command";

/** getPresetIcon key for a runtime's logo. */
export function iconNameForRuntime(runtime: AgentType): string {
	return runtime === "codex" ? "codex" : "claude";
}
