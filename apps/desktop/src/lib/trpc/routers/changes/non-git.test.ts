import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * getStatus / getBranches must degrade gracefully on a "Folder (no git)" agent:
 * a directory that is not a git repo returns an empty result instead of
 * throwing, so a UI path that forgets to gate never spams TRPC errors.
 *
 * We point the procedures at a real (non-git) temp dir and stub localDb so the
 * assertRegisteredWorktree security boundary treats that dir as registered.
 */

const DIR = mkdtempSync(join(tmpdir(), "roster-non-git-"));

// assertRegisteredWorktree (path-validation) only needs a truthy worktree row.
mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				where: () => ({ get: () => ({ path: DIR }) }),
			}),
		}),
	},
}));

let createStatusRouter: typeof import("./status").createStatusRouter;
let createBranchesRouter: typeof import("./branches").createBranchesRouter;

beforeAll(async () => {
	createStatusRouter = (await import("./status")).createStatusRouter;
	createBranchesRouter = (await import("./branches")).createBranchesRouter;
});

afterAll(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("changes endpoints on a non-git directory", () => {
	it("getStatus returns an empty, clean status (does not throw)", async () => {
		const caller = createStatusRouter().createCaller({});
		const res = await caller.getStatus({
			worktreePath: DIR,
			defaultBranch: "main",
		});

		expect(res.branch).toBe("");
		expect(res.staged).toEqual([]);
		expect(res.unstaged).toEqual([]);
		expect(res.untracked).toEqual([]);
		expect(res.commits).toEqual([]);
		expect(res.ahead).toBe(0);
		expect(res.behind).toBe(0);
		expect(res.hasUpstream).toBe(false);
	});

	it("getBranches returns empty branch sets (does not throw)", async () => {
		const caller = createBranchesRouter().createCaller({});
		const res = await caller.getBranches({ worktreePath: DIR });

		expect(res.local).toEqual([]);
		expect(res.remote).toEqual([]);
		expect(res.defaultBranch).toBe("main");
		expect(res.checkedOutBranches).toEqual({});
		expect(res.worktreeBaseBranch).toBeNull();
	});
});
