export const AGENT_TYPES = ["claude", "codex"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_LABELS: Record<AgentType, string> = {
	claude: "Claude",
	codex: "Codex",
};

/**
 * Permission posture for a session. "guarded" keeps the CLI's native
 * approval prompts and sandbox (recommended default). "auto" grants the
 * CLI full autonomy — only for repos you fully trust.
 */
export const PERMISSION_MODES = ["guarded", "auto"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export const DEFAULT_PERMISSION_MODE: PermissionMode = "guarded";

export interface BuildRuntimeCommandOptions {
	runtime: AgentType;
	mode?: PermissionMode;
	/** --model value passed to the CLI; null/undefined = CLI's configured default */
	model?: string | null;
	/** Codex only */
	reasoningEffort?: "medium" | "high";
	/**
	 * Optional initial prompt submitted when the interactive session opens
	 * (positional argument on both CLIs). Used for the first-session
	 * introduction of a brand-new agent.
	 */
	initialPrompt?: string;
}

/** Single-quote a string for the shell (POSIX-safe). */
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * First words a brand-new agent hears. Makes the agent introduce itself
 * instead of dropping the user at a blank prompt: who it is (AGENT.md), what
 * tools it has, what it could do, and a question to get started. Read-only by
 * instruction, so a guarded session needs no approvals to answer.
 */
export const FIRST_SESSION_KICKOFF_PROMPT =
	"This is your very first session with your user watching. In a few short " +
	"lines: introduce yourself by name and role (see AGENT.md), mention the " +
	"tools listed in your Tools section (if none are wired up yet, say they " +
	"can be added in the Connectors panel on the right), offer two or three " +
	"concrete things you could do right now given your role, and end by " +
	"asking what to start with. Plain language, no headers. Do not create or " +
	"modify any files for this introduction.";

export function buildRuntimeCommand({
	runtime,
	mode = DEFAULT_PERMISSION_MODE,
	model,
	reasoningEffort,
	initialPrompt,
}: BuildRuntimeCommandOptions): string {
	if (runtime === "claude") {
		const parts = ["claude"];
		if (model) parts.push("--model", model);
		if (mode === "auto") parts.push("--dangerously-skip-permissions");
		if (initialPrompt) parts.push(shellQuote(initialPrompt));
		return parts.join(" ");
	}
	const parts = ["codex", "--model", model ?? "gpt-5.5"];
	parts.push(`-c model_reasoning_effort="${reasoningEffort ?? "high"}"`);
	parts.push('-c model_reasoning_summary="detailed"');
	parts.push("-c model_supports_reasoning_summaries=true");
	if (mode === "auto") {
		parts.push("--ask-for-approval never", "--sandbox danger-full-access");
	}
	if (initialPrompt) parts.push(shellQuote(initialPrompt));
	return parts.join(" ");
}

/** Model variants launchable from the model bar. */
export interface ModelVariant {
	id: string;
	runtime: AgentType;
	/** Short label rendered next to the runtime icon in the model bar. */
	label: string;
	/** Tooltip / long name. */
	description: string;
	model: string | null;
	reasoningEffort?: "medium" | "high";
	isDefault?: boolean;
}

export const MODEL_VARIANTS: ModelVariant[] = [
	{
		id: "claude-default",
		runtime: "claude",
		label: "Claude",
		description: "Start a new session — Claude Code (CLI default model)",
		model: null,
		isDefault: true,
	},
	{
		id: "claude-fable",
		runtime: "claude",
		label: "Fable",
		description: "Start a new session — Claude Code (Fable 5)",
		model: "claude-fable-5",
	},
	{
		id: "claude-opus",
		runtime: "claude",
		label: "Opus",
		description: "Start a new session — Claude Code (Opus 4.8)",
		model: "claude-opus-4-8",
	},
	{
		id: "claude-sonnet",
		runtime: "claude",
		label: "Sonnet",
		description: "Start a new session — Claude Code (Sonnet 5)",
		model: "claude-sonnet-5",
	},
	{
		id: "codex-high",
		runtime: "codex",
		label: "High",
		description: "Start a new session — Codex (GPT-5.5, high reasoning)",
		model: "gpt-5.5",
		reasoningEffort: "high",
	},
	{
		id: "codex-medium",
		runtime: "codex",
		label: "Medium",
		description: "Start a new session — Codex (GPT-5.5, medium reasoning)",
		model: "gpt-5.5",
		reasoningEffort: "medium",
	},
];

/** Preset commands per runtime; index 0 (guarded) is the launch default. */
export const AGENT_PRESET_COMMANDS: Record<AgentType, string[]> = {
	claude: [
		buildRuntimeCommand({ runtime: "claude", mode: "guarded" }),
		buildRuntimeCommand({ runtime: "claude", mode: "auto" }),
	],
	codex: [
		buildRuntimeCommand({ runtime: "codex", mode: "guarded" }),
		buildRuntimeCommand({ runtime: "codex", mode: "auto" }),
	],
};

export const AGENT_PRESET_DESCRIPTIONS: Record<AgentType, string> = {
	claude: "Claude Code — guarded permissions by default",
	codex: "Codex — guarded approvals and sandbox by default",
};

export interface TaskInput {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	priority: string;
	statusName: string | null;
	labels: string[] | null;
}

function buildPrompt(task: TaskInput): string {
	const metadata = [
		`Priority: ${task.priority}`,
		task.statusName && `Status: ${task.statusName}`,
		task.labels?.length && `Labels: ${task.labels.join(", ")}`,
	]
		.filter(Boolean)
		.join("\n");

	return `You are working on task "${task.title}" (${task.slug}).

${metadata}

## Task Description

${task.description || "No description provided."}

## Instructions

You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.

1. Explore the codebase to understand the relevant code and architecture
2. Create a detailed execution plan for this task including:
   - Purpose and scope of the changes
   - Key assumptions
   - Concrete implementation steps with specific files to modify
   - How to validate the changes work correctly
3. Implement the plan
4. Verify your changes work correctly (run relevant tests, typecheck, lint)
5. When done, use the Roster MCP \`update_task\` tool to update task "${task.id}" with a summary of what was done`;
}

function buildHeredoc(
	prompt: string,
	delimiter: string,
	command: string,
	suffix?: string,
): string {
	const closing = suffix ? `)" ${suffix}` : ')"';
	return [
		`${command} "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		closing,
	].join("\n");
}

const AGENT_COMMANDS: Record<
	AgentType,
	(prompt: string, delimiter: string) => string
> = {
	claude: (prompt, delimiter) => buildHeredoc(prompt, delimiter, "claude"),
	codex: (prompt, delimiter) =>
		buildHeredoc(
			prompt,
			delimiter,
			'codex --model gpt-5.5 -c model_reasoning_effort="high" --',
		),
};

export function buildAgentPromptCommand({
	prompt,
	randomId,
	agent = "claude",
}: {
	prompt: string;
	randomId: string;
	agent?: AgentType;
}): string {
	let delimiter = `ROSTER_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	const builder = AGENT_COMMANDS[agent];
	return builder(prompt, delimiter);
}

export function buildAgentCommand({
	task,
	randomId,
	agent = "claude",
}: {
	task: TaskInput;
	randomId: string;
	agent?: AgentType;
}): string {
	const prompt = buildPrompt(task);
	return buildAgentPromptCommand({ prompt, randomId, agent });
}

/** @deprecated Use `buildAgentCommand` instead */
export function buildClaudeCommand({
	task,
	randomId,
}: {
	task: TaskInput;
	randomId: string;
}): string {
	return buildAgentCommand({ task, randomId, agent: "claude" });
}
