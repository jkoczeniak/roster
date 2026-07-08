import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Folder-agent delete path: removeAgentWorktreeFromDisk({ vcs: "none" }) must
 * remove the agent's home tree with fs and NEVER touch git worktree plumbing.
 * We mock ./git so any accidental call to removeWorktree is recorded (and would
 * fail the assertion). teardown.ts is the only consumer of ./git in this chain.
 */

const removeWorktreeMock = mock(async () => {});
mock.module("./git", () => ({ removeWorktree: removeWorktreeMock }));

let removeAgentWorktreeFromDisk: typeof import("./teardown").removeAgentWorktreeFromDisk;

const ROOT = join(
	tmpdir(),
	`roster-teardown-test-${process.pid}-${Date.now()}`,
);

beforeAll(async () => {
	removeAgentWorktreeFromDisk = (await import("./teardown"))
		.removeAgentWorktreeFromDisk;
});

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
	removeWorktreeMock.mockRestore();
});

describe("removeAgentWorktreeFromDisk — folder (vcs: none) agent", () => {
	it("removes the agent home directory without invoking git worktree", async () => {
		const agentHome = join(ROOT, "agent-a");
		const worktreePath = join(agentHome, "worktree");
		mkdirSync(worktreePath, { recursive: true });
		writeFileSync(join(worktreePath, "note.txt"), "hi");
		expect(existsSync(agentHome)).toBe(true);

		const result = await removeAgentWorktreeFromDisk({
			vcs: "none",
			agentHome,
			mainRepoPath: "",
			worktreePath,
		});

		expect(result.success).toBe(true);
		// The whole agent home tree (worktree included) is gone.
		expect(existsSync(agentHome)).toBe(false);
		// Git plumbing was never called.
		expect(removeWorktreeMock).not.toHaveBeenCalled();
	});

	it("delegates to git removeWorktree for a git agent (vcs: 'git')", async () => {
		const agentHome = join(ROOT, "agent-b");
		const worktreePath = join(agentHome, "worktree");
		mkdirSync(worktreePath, { recursive: true });

		removeWorktreeMock.mockClear();
		const result = await removeAgentWorktreeFromDisk({
			vcs: "git",
			agentHome,
			mainRepoPath: "/some/main/repo",
			worktreePath,
		});

		expect(result.success).toBe(true);
		expect(removeWorktreeMock).toHaveBeenCalledTimes(1);
		expect(removeWorktreeMock).toHaveBeenCalledWith(
			"/some/main/repo",
			worktreePath,
		);
	});
});
