import { describe, expect, it } from "bun:test";
import { createAgentInput } from "./create-agent-input";

/**
 * Input validation for createAgent — focused on the optional `role` field
 * captured in the New Agent modal (trimmed, empty → undefined, capped length).
 */
describe("createAgentInput role", () => {
	const base = { projectId: "cat-1", name: "Scout" };

	it("defaults role to undefined when omitted", () => {
		const parsed = createAgentInput.parse(base);
		expect(parsed.role).toBeUndefined();
	});

	it("trims surrounding whitespace", () => {
		const parsed = createAgentInput.parse({ ...base, role: "  Researcher  " });
		expect(parsed.role).toBe("Researcher");
	});

	it("treats a whitespace-only role as unset (undefined)", () => {
		const parsed = createAgentInput.parse({ ...base, role: "   " });
		expect(parsed.role).toBeUndefined();
	});

	it("treats an empty string as unset (undefined)", () => {
		const parsed = createAgentInput.parse({ ...base, role: "" });
		expect(parsed.role).toBeUndefined();
	});

	it("keeps a role at the max length", () => {
		const role = "a".repeat(280);
		const parsed = createAgentInput.parse({ ...base, role });
		expect(parsed.role).toBe(role);
	});

	it("rejects a role over the max length", () => {
		expect(() =>
			createAgentInput.parse({ ...base, role: "a".repeat(281) }),
		).toThrow();
	});
});

/**
 * Repo source discriminated-union — the "Folder (no git)" option must be
 * accepted alongside the existing init/clone members.
 */
describe("createAgentInput repo source", () => {
	const base = { projectId: "cat-1", name: "Scout" };

	it("defaults to a plain folder (no git) when repo is omitted", () => {
		const parsed = createAgentInput.parse(base);
		expect(parsed.repo).toEqual({ type: "folder" });
	});

	it("accepts the init (fresh git repo) source", () => {
		const parsed = createAgentInput.parse({ ...base, repo: { type: "init" } });
		expect(parsed.repo).toEqual({ type: "init" });
	});

	it("accepts the folder (no git) source", () => {
		const parsed = createAgentInput.parse({
			...base,
			repo: { type: "folder" },
		});
		expect(parsed.repo).toEqual({ type: "folder" });
	});

	it("accepts a safe clone URL", () => {
		const parsed = createAgentInput.parse({
			...base,
			repo: { type: "clone", url: "https://github.com/jkoczeniak/roster.git" },
		});
		expect(parsed.repo).toEqual({
			type: "clone",
			url: "https://github.com/jkoczeniak/roster.git",
		});
	});

	it("rejects an unknown repo source type", () => {
		expect(() =>
			createAgentInput.parse({ ...base, repo: { type: "bogus" } }),
		).toThrow();
	});
});
