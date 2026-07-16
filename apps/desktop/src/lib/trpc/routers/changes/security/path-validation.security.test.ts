import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROSTER_HOME_DIR } from "main/lib/app-environment";
import {
	assertPathInAllowedRoot,
	PathValidationError,
} from "./path-validation";

/**
 * Root confinement for the generic filesystem tRPC surface. The DB mock in
 * test-setup returns no worktrees/projects, so the only allowed roots are the
 * Roster home dir and ~/.claude — exactly the fallback floor the guard must
 * always enforce.
 */
describe("assertPathInAllowedRoot", () => {
	it("allows paths inside the Roster home dir", () => {
		const target = join(ROSTER_HOME_DIR, "agents", "abc", "memory.md");
		expect(assertPathInAllowedRoot(target)).toBe(target);
	});

	it("allows the ~/.claude sessions dir", () => {
		const target = join(homedir(), ".claude", "projects", "x", "y.jsonl");
		expect(assertPathInAllowedRoot(target)).toBe(target);
	});

	it("rejects system paths", () => {
		expect(() => assertPathInAllowedRoot("/etc/passwd")).toThrow(
			PathValidationError,
		);
		expect(() => assertPathInAllowedRoot("/")).toThrow(PathValidationError);
	});

	it("rejects the home dir itself (only specific subtrees are allowed)", () => {
		expect(() => assertPathInAllowedRoot(homedir())).toThrow(
			PathValidationError,
		);
		expect(() => assertPathInAllowedRoot(join(homedir(), ".ssh"))).toThrow(
			PathValidationError,
		);
	});

	it("rejects traversal that escapes an allowed root", () => {
		const escaping = join(ROSTER_HOME_DIR, "..", "..", "etc", "passwd");
		expect(() => assertPathInAllowedRoot(escaping)).toThrow(
			PathValidationError,
		);
	});

	it("rejects prefix look-alikes of allowed roots", () => {
		expect(() => assertPathInAllowedRoot(`${ROSTER_HOME_DIR}-evil/x`)).toThrow(
			PathValidationError,
		);
	});
});
