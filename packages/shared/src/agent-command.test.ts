import { describe, expect, it } from "bun:test";
import { buildAgentPromptCommand, buildRuntimeCommand } from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			'model_reasoning_effort="high" -- "$(cat <<\'ROSTER_PROMPT_12345678\'',
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith("claude \"$(cat <<'ROSTER_PROMPT_abcdefgh'");
	});
});

describe("buildRuntimeCommand", () => {
	it("defaults claude to a guarded command with no model", () => {
		expect(buildRuntimeCommand({ runtime: "claude" })).toBe("claude");
	});

	it("passes --model and skips permissions for claude in auto mode", () => {
		expect(
			buildRuntimeCommand({
				runtime: "claude",
				mode: "auto",
				model: "claude-opus-4-8",
			}),
		).toBe("claude --model claude-opus-4-8 --dangerously-skip-permissions");
	});

	it("defaults codex to gpt-5.5 with high reasoning and no sandbox override", () => {
		const command = buildRuntimeCommand({ runtime: "codex" });
		expect(command).toBe(
			'codex --model gpt-5.5 -c model_reasoning_effort="high" -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
		);
	});

	it("adds approval + sandbox flags for codex in auto mode", () => {
		const command = buildRuntimeCommand({
			runtime: "codex",
			mode: "auto",
			reasoningEffort: "medium",
		});
		expect(command).toContain('-c model_reasoning_effort="medium"');
		expect(command).toContain("--ask-for-approval never");
		expect(command).toContain("--sandbox danger-full-access");
	});
});
