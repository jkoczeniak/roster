import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Workspace-trust allow-list persistence. The env override must be set BEFORE
 * importing the module so app-environment resolves ROSTER_HOME_DIR under a
 * throwaway home rather than the user's real ~/.roster-default.
 */
const TEST_HOME = join(
	tmpdir(),
	`roster-trust-test-${process.pid}-${Date.now()}`,
);
process.env.ADE_HOME_DIR = TEST_HOME;

const { isTrusted, trust, listTrusted } = await import("./workspace-trust");

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
});

describe("workspace-trust", () => {
	it("is not trusted by default", () => {
		const root = mkdtempSync(join(tmpdir(), "roster-untrusted-"));
		expect(isTrusted(root)).toBe(false);
		expect(listTrusted()).not.toContain(root);
	});

	it("persists trust and reports it afterwards", () => {
		const root = mkdtempSync(join(tmpdir(), "roster-trusted-"));
		expect(isTrusted(root)).toBe(false);

		trust(root);

		expect(isTrusted(root)).toBe(true);
		expect(listTrusted()).toContain(root);
	});

	it("writes the trusted-roots file with 0600 permissions", () => {
		const root = mkdtempSync(join(tmpdir(), "roster-trusted-mode-"));
		trust(root);

		const file = join(TEST_HOME, "trusted-roots.json");
		expect(existsSync(file)).toBe(true);
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	it("is idempotent — trusting twice keeps a single entry", () => {
		const root = mkdtempSync(join(tmpdir(), "roster-idempotent-"));
		trust(root);
		trust(root);
		expect(listTrusted().filter((r) => r === root)).toHaveLength(1);
	});
});
