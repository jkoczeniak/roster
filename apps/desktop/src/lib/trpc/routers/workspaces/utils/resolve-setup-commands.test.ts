import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * resolveSetupCommands is the MAIN-process security gate: a repo's `.roster`
 * setup commands may only land in the auto-run `initialCommands` slot when the
 * repo root is trusted. For an untrusted root they must move to the review-only
 * `untrustedSetupCommands` slot with `initialCommands: null`.
 *
 * The ADE_HOME_DIR override must be set BEFORE importing workspace-trust so the
 * trusted-roots allow-list lives under a throwaway home.
 */
const TEST_HOME = join(
	tmpdir(),
	`roster-resolve-setup-test-${process.pid}-${Date.now()}`,
);
process.env.ADE_HOME_DIR = TEST_HOME;

const { resolveSetupCommands } = await import("./setup");
const { trust } = await import("main/lib/workspace-trust");

const createdRepos: string[] = [];

function makeRepoWithSetup(setup: string[]): string {
	const root = mkdtempSync(join(tmpdir(), "roster-resolve-setup-repo-"));
	createdRepos.push(root);
	mkdirSync(join(root, ".roster"), { recursive: true });
	writeFileSync(
		join(root, ".roster", "config.json"),
		JSON.stringify({ setup }),
	);
	return root;
}

afterEach(() => {
	for (const repo of createdRepos.splice(0)) {
		rmSync(repo, { recursive: true, force: true });
	}
});

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
});

describe("resolveSetupCommands", () => {
	it("withholds setup commands from auto-run for an untrusted root", () => {
		const commands = ["npm install", "npm run build"];
		const root = makeRepoWithSetup(commands);

		const result = resolveSetupCommands({ mainRepoPath: root });

		expect(result.trusted).toBe(false);
		expect(result.initialCommands).toBeNull();
		expect(result.untrustedSetupCommands).toEqual(commands);
	});

	it("auto-runs setup commands only once the root is trusted", () => {
		const commands = ["npm install", "npm run build"];
		const root = makeRepoWithSetup(commands);

		trust(root);

		const result = resolveSetupCommands({ mainRepoPath: root });

		expect(result.trusted).toBe(true);
		expect(result.initialCommands).toEqual(commands);
		expect(result.untrustedSetupCommands).toBeNull();
	});

	it("returns both slots null when the repo has no setup commands", () => {
		const root = mkdtempSync(join(tmpdir(), "roster-resolve-setup-empty-"));
		createdRepos.push(root);

		const result = resolveSetupCommands({ mainRepoPath: root });

		expect(result.initialCommands).toBeNull();
		expect(result.untrustedSetupCommands).toBeNull();
	});
});
