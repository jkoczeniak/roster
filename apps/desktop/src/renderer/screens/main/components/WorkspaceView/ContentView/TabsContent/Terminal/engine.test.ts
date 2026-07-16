import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	adaptKeyHandlerForGhostty,
	redrawTerminal,
	syncGhosttyDevicePixelRatio,
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

// Regression guard: ghostty-web's CanvasRenderer captures devicePixelRatio
// once at construction, so a window dragged to a different-DPI monitor stays
// blurry until remount. syncGhosttyDevicePixelRatio must mutate the live
// renderer's ratio (render() then self-heals the canvas backing store) and
// report whether a repaint is needed.
describe("syncGhosttyDevicePixelRatio", () => {
	const originalWindow = globalThis.window;

	beforeEach(() => {
		// @ts-expect-error - minimal window stand-in for the Node test env
		globalThis.window = { devicePixelRatio: 2 };
	});

	afterEach(() => {
		globalThis.window = originalWindow;
	});

	const makeGhosttyTerm = (rendererDpr: number) => {
		const renderer = {
			setTheme() {},
			render() {},
			charWidth: 8,
			charHeight: 16,
			devicePixelRatio: rendererDpr,
		};
		const term = { renderer } as unknown as TerminalInstance;
		return { term, renderer };
	};

	it("updates a stale renderer ratio and reports a change", () => {
		const { term, renderer } = makeGhosttyTerm(1);
		expect(syncGhosttyDevicePixelRatio(term)).toBe(true);
		expect(renderer.devicePixelRatio).toBe(2);
	});

	it("is a no-op when the ratio already matches", () => {
		const { term, renderer } = makeGhosttyTerm(2);
		expect(syncGhosttyDevicePixelRatio(term)).toBe(false);
		expect(renderer.devicePixelRatio).toBe(2);
	});

	it("is a no-op on xterm terminals (no ghostty renderer)", () => {
		const term = { rows: 10 } as unknown as TerminalInstance;
		expect(syncGhosttyDevicePixelRatio(term)).toBe(false);
	});
});
