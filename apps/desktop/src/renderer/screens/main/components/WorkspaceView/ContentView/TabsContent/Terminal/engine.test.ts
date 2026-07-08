import { describe, expect, it } from "bun:test";
import {
	adaptKeyHandlerForGhostty,
	redrawTerminal,
	type TerminalInstance,
} from "./engine";

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

// Regression guard: the ghostty canvas can sit blank after a tab switch /
// re-mount unless we force a full render. redrawTerminal must force-render on
// ghostty (renderer.render(..., forceAll=true)) and use refresh() on xterm.
describe("redrawTerminal", () => {
	it("forces a full ghostty canvas render", () => {
		const calls: Array<{ forceAll?: boolean }> = [];
		const term = {
			rows: 24,
			wasmTerm: {},
			getViewportY: () => 0,
			renderer: {
				setTheme() {},
				charWidth: 8,
				charHeight: 16,
				render(_buffer: unknown, forceAll?: boolean) {
					calls.push({ forceAll });
				},
			},
		} as unknown as TerminalInstance;
		redrawTerminal(term);
		expect(calls).toEqual([{ forceAll: true }]);
	});

	it("falls back to xterm refresh() when there is no ghostty renderer", () => {
		const refreshCalls: Array<[number, number]> = [];
		const term = {
			rows: 10,
			refresh(start: number, end: number) {
				refreshCalls.push([start, end]);
			},
		} as unknown as TerminalInstance;
		redrawTerminal(term);
		expect(refreshCalls).toEqual([[0, 9]]);
	});
});
