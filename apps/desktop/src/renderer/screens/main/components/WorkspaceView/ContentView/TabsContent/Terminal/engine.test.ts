import { describe, expect, it } from "bun:test";
import { adaptKeyHandlerForGhostty } from "./engine";

// Regression guard for a bug that left the ghostty terminal input-dead:
// ghostty-web swallows a key when the custom key handler returns truthy,
// which is the OPPOSITE of xterm.js (where true = "process the key"). The
// adapter must invert the return value so xterm-style handlers work on
// ghostty. If this ever "simplifies" back to identity, typing breaks.
describe("adaptKeyHandlerForGhostty", () => {
	const ev = {} as KeyboardEvent;

	it("inverts a handler that returns true (xterm 'process' => ghostty falsy 'process')", () => {
		const adapted = adaptKeyHandlerForGhostty(() => true);
		expect(adapted(ev)).toBe(false);
	});

	it("inverts a handler that returns false (xterm 'swallow' => ghostty truthy 'swallow')", () => {
		const adapted = adaptKeyHandlerForGhostty(() => false);
		expect(adapted(ev)).toBe(true);
	});

	it("passes the event through to the wrapped handler", () => {
		const seen: KeyboardEvent[] = [];
		const adapted = adaptKeyHandlerForGhostty((e) => {
			seen.push(e);
			return true;
		});
		adapted(ev);
		expect(seen).toEqual([ev]);
	});
});
