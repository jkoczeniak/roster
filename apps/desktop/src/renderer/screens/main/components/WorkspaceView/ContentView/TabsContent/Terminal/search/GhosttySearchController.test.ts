import { describe, expect, it } from "bun:test";
import type { SearchResultsSummary, TerminalInstance } from "../engine";
import { GhosttySearchController } from "./GhosttySearchController";

interface MockTerminalOptions {
	lines: string[];
	rows?: number;
	viewportY?: number;
}

function createMockTerminal(options: MockTerminalOptions): {
	terminal: TerminalInstance;
	scrolled: number[];
	scrollToBottomCalls: { count: number };
} {
	const rows = options.rows ?? 5;
	const scrolled: number[] = [];
	const scrollToBottomCalls = { count: 0 };
	let viewportY = options.viewportY ?? 0;

	const terminal = {
		rows,
		cols: 80,
		buffer: {
			active: {
				type: "normal",
				length: options.lines.length,
				getLine: (y: number) => {
					const text = options.lines[y];
					if (text === undefined) return undefined;
					return {
						length: text.length,
						isWrapped: false,
						translateToString: () => text,
					};
				},
			},
		},
		getViewportY: () => viewportY,
		scrollLines: (amount: number) => {
			scrolled.push(amount);
			viewportY = Math.max(0, viewportY - amount);
		},
		scrollToBottom: () => {
			scrollToBottomCalls.count++;
			viewportY = 0;
		},
	} as unknown as TerminalInstance;

	return { terminal, scrolled, scrollToBottomCalls };
}

describe("GhosttySearchController", () => {
	it("finds matches and reports counts", () => {
		const { terminal } = createMockTerminal({
			lines: ["foo bar", "baz", "foo again", "nothing", "foo"],
		});
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		expect(controller.findNext("foo")).toBe(true);
		expect(results.at(-1)?.resultCount).toBe(3);
		expect(results.at(-1)?.resultIndex).toBe(0);
	});

	it("returns false and emits zero results for no matches", () => {
		const { terminal } = createMockTerminal({ lines: ["alpha", "beta"] });
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		expect(controller.findNext("gamma")).toBe(false);
		expect(results.at(-1)).toEqual({ resultIndex: -1, resultCount: 0 });
	});

	it("advances and wraps with findNext / findPrevious", () => {
		const { terminal } = createMockTerminal({
			lines: ["foo", "x", "foo", "x", "foo"],
		});
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		controller.findNext("foo"); // index 0
		controller.findNext("foo"); // index 1
		controller.findNext("foo"); // index 2
		expect(results.at(-1)?.resultIndex).toBe(2);

		controller.findNext("foo"); // wraps to 0
		expect(results.at(-1)?.resultIndex).toBe(0);

		controller.findPrevious("foo"); // wraps back to 2
		expect(results.at(-1)?.resultIndex).toBe(2);
	});

	it("respects case sensitivity", () => {
		const { terminal } = createMockTerminal({ lines: ["Foo", "foo"] });
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		controller.findNext("Foo", { caseSensitive: true });
		expect(results.at(-1)?.resultCount).toBe(1);

		controller.findNext("Foo", { caseSensitive: false });
		expect(results.at(-1)?.resultCount).toBe(2);
	});

	it("supports regex queries and ignores invalid regexes", () => {
		const { terminal } = createMockTerminal({
			lines: ["error: 404", "ok", "error: 500"],
		});
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		expect(controller.findNext("error: \\d+", { regex: true })).toBe(true);
		expect(results.at(-1)?.resultCount).toBe(2);

		expect(controller.findNext("[", { regex: true })).toBe(false);
	});

	it("scrolls an off-screen match into view", () => {
		// 20 buffer lines, 5 visible rows => 15 lines of scrollback.
		const lines = Array.from({ length: 20 }, (_, i) =>
			i === 2 ? "needle" : `line ${i}`,
		);
		const { terminal, scrolled } = createMockTerminal({ lines, rows: 5 });
		const controller = new GhosttySearchController(terminal);

		expect(controller.findNext("needle")).toBe(true);
		// Match at row 2 with 15 lines of scrollback => target offset 15
		// (clamped), starting from 0 => scrollLines(0 - 15).
		expect(scrolled).toEqual([-15]);
	});

	it("scrolls back to bottom when the match is on-screen", () => {
		const lines = Array.from({ length: 20 }, (_, i) =>
			i === 19 ? "needle" : `line ${i}`,
		);
		const { terminal, scrollToBottomCalls } = createMockTerminal({
			lines,
			rows: 5,
			viewportY: 10,
		});
		const controller = new GhosttySearchController(terminal);

		expect(controller.findNext("needle")).toBe(true);
		expect(scrollToBottomCalls.count).toBe(1);
	});

	it("clearDecorations resets state and emits", () => {
		const { terminal } = createMockTerminal({ lines: ["foo"] });
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));

		controller.findNext("foo");
		controller.clearDecorations();
		expect(results.at(-1)).toEqual({ resultIndex: -1, resultCount: 0 });
	});

	it("stops emitting after dispose", () => {
		const { terminal } = createMockTerminal({ lines: ["foo"] });
		const controller = new GhosttySearchController(terminal);

		const results: SearchResultsSummary[] = [];
		controller.onDidChangeResults((event) => results.push(event));
		controller.dispose();

		expect(controller.findNext("foo")).toBe(false);
		expect(results).toEqual([]);
	});
});
