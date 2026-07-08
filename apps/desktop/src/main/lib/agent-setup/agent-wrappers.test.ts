import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import * as realOs from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	realOs.tmpdir(),
	`roster-agent-wrappers-${process.pid}-${Date.now()}`,
);
const TEST_BIN_DIR = path.join(TEST_ROOT, "roster", "bin");
const TEST_HOOKS_DIR = path.join(TEST_ROOT, "roster", "hooks");
const TEST_ZSH_DIR = path.join(TEST_ROOT, "roster", "zsh");
const TEST_BASH_DIR = path.join(TEST_ROOT, "roster", "bash");
let mockedHomeDir = path.join(TEST_ROOT, "home");

mock.module("shared/env.shared", () => ({
	env: {
		DESKTOP_NOTIFICATIONS_PORT: 7777,
	},
	getWorkspaceName: () => undefined,
}));

mock.module("./notify-hook", () => ({
	NOTIFY_SCRIPT_NAME: "notify.sh",
	NOTIFY_SCRIPT_MARKER: "# Roster agent notification hook",
	getNotifyScriptPath: () => path.join(TEST_HOOKS_DIR, "notify.sh"),
	getNotifyScriptContent: () => "#!/bin/bash\nexit 0\n",
	createNotifyScript: () => {},
}));

mock.module("./paths", () => ({
	BIN_DIR: TEST_BIN_DIR,
	HOOKS_DIR: TEST_HOOKS_DIR,
	ZSH_DIR: TEST_ZSH_DIR,
	BASH_DIR: TEST_BASH_DIR,
}));

mock.module("node:os", () => ({
	...realOs,
	homedir: () => mockedHomeDir,
	default: {
		...realOs,
		homedir: () => mockedHomeDir,
	},
}));

const { buildCodexWrapperExecLine, createCodexWrapper } = await import(
	"./agent-wrappers"
);

describe("agent-wrappers codex", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("injects codex message-start watcher + completion notifications in wrapper", () => {
		createCodexWrapper();

		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const wrapper = readFileSync(wrapperPath, "utf-8");

		expect(wrapper).toContain("export CODEX_TUI_RECORD_SESSION=1");
		expect(wrapper).toContain('"type":"task_started"');
		expect(wrapper).toContain('_roster_last_turn_id=""');
		expect(wrapper).toContain("_roster_turn_id=$(printf");
		expect(wrapper).toContain('awk -F\'"turn_id":"\'');
		expect(wrapper).toContain('{"hook_event_name":"Start"}');
		expect(wrapper).toContain(
			`"$REAL_BIN" -c 'notify=["bash","${path.join(TEST_HOOKS_DIR, "notify.sh")}"]' "$@"`,
		);
		expect(wrapper).toContain("ROSTER_CODEX_START_WATCHER_PID");
		expect(wrapper).toContain('kill "$ROSTER_CODEX_START_WATCHER_PID"');

		const execLine = buildCodexWrapperExecLine(
			path.join(TEST_HOOKS_DIR, "notify.sh"),
		);
		expect(execLine).not.toContain("{{NOTIFY_PATH}}");
		expect(wrapper).toContain(execLine);
	});
});
