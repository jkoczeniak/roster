import { beforeAll, describe, expect, it, mock } from "bun:test";

/**
 * assertGitWorktree is the chokepoint that keeps git/gh mutations off
 * "Folder (no git)" agents: a registered worktree row with vcs === "none"
 * must be rejected with NON_GIT_WORKTREE, while git (or legacy null-vcs)
 * rows pass exactly like assertRegisteredWorktree.
 */

// Stateful stub: each test points `row` at the worktree row the DB "returns".
let row: { path: string; vcs: string | null } | undefined;

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				where: () => ({ get: () => row }),
			}),
		}),
	},
}));

let assertGitWorktree: typeof import("./path-validation").assertGitWorktree;
let PathValidationError: typeof import("./path-validation").PathValidationError;

beforeAll(async () => {
	const pv = await import("./path-validation");
	assertGitWorktree = pv.assertGitWorktree;
	PathValidationError = pv.PathValidationError;
});

describe("assertGitWorktree", () => {
	it("rejects a folder (vcs='none') worktree with NON_GIT_WORKTREE", () => {
		row = { path: "/tmp/folder-agent", vcs: "none" };
		try {
			assertGitWorktree("/tmp/folder-agent");
			throw new Error("expected assertGitWorktree to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(PathValidationError);
			expect((error as InstanceType<typeof PathValidationError>).code).toBe(
				"NON_GIT_WORKTREE",
			);
		}
	});

	it("passes a git worktree", () => {
		row = { path: "/tmp/git-agent", vcs: "git" };
		expect(() => assertGitWorktree("/tmp/git-agent")).not.toThrow();
	});

	it("passes a legacy row with vcs=null (pre-migration agents are git)", () => {
		row = { path: "/tmp/legacy-agent", vcs: null };
		expect(() => assertGitWorktree("/tmp/legacy-agent")).not.toThrow();
	});

	it("rejects an unregistered path with UNREGISTERED_WORKTREE", () => {
		row = undefined;
		try {
			assertGitWorktree("/tmp/not-registered");
			throw new Error("expected assertGitWorktree to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(PathValidationError);
			expect((error as InstanceType<typeof PathValidationError>).code).toBe(
				"UNREGISTERED_WORKTREE",
			);
		}
	});
});
