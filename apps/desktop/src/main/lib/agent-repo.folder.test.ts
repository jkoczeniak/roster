import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * "Folder (no git)" agent: setupAgentRepo must create the worktree directory
 * without any git repo and report vcs:"none" + branch:"". Runs against a
 * throwaway ADE_HOME_DIR so the user's live ~/.roster-default is never touched.
 * The env var is set BEFORE importing agent-home/agent-repo so path helpers
 * resolve under TEST_HOME.
 */

const TEST_HOME = join(
	tmpdir(),
	`roster-folder-test-${process.pid}-${Date.now()}`,
);
process.env.ADE_HOME_DIR = TEST_HOME;

let getAgentWorktreePath: (id: string) => string;
let getAgentMemoryDir: (id: string) => string;
let setupAgentRepo: typeof import("./agent-repo").setupAgentRepo;

beforeAll(async () => {
	const home = await import("./agent-home");
	getAgentWorktreePath = home.getAgentWorktreePath;
	getAgentMemoryDir = home.getAgentMemoryDir;
	setupAgentRepo = (await import("./agent-repo")).setupAgentRepo;

	expect(getAgentWorktreePath("x").startsWith(TEST_HOME)).toBe(true);
});

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
});

describe("setupAgentRepo — folder (no git) agent", () => {
	it("creates the worktree dir WITHOUT a .git and returns vcs:'none' + branch:''", async () => {
		const agentId = "folder-agent-1";
		const result = await setupAgentRepo({
			agentId,
			source: { type: "folder" },
		});

		expect(result.vcs).toBe("none");
		expect(result.branch).toBe("");
		expect(result.worktreePath).toBe(getAgentWorktreePath(agentId));

		// The worktree directory exists...
		expect(existsSync(result.worktreePath)).toBe(true);
		// ...but it is a plain folder — no git repo was initialized.
		expect(existsSync(join(result.worktreePath, ".git"))).toBe(false);
		// The canonical memory dir is still created (feature parity).
		expect(existsSync(getAgentMemoryDir(agentId))).toBe(true);
	});

	it("is idempotent on a retry (re-running the folder branch is a no-op)", async () => {
		const agentId = "folder-agent-2";
		await setupAgentRepo({ agentId, source: { type: "folder" } });
		const second = await setupAgentRepo({
			agentId,
			source: { type: "folder" },
		});

		expect(second.vcs).toBe("none");
		expect(second.branch).toBe("");
		expect(existsSync(join(second.worktreePath, ".git"))).toBe(false);
	});
});
