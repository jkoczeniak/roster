import type { ITheme } from "@xterm/xterm";
import { init as initGhostty } from "ghostty-web";

/**
 * Terminal engine selection and the engine-agnostic terminal surface.
 *
 * The renderer supports two terminal engines:
 * - "ghostty" (default): ghostty-web, a WASM port of Ghostty's VT100 core with
 *   its own canvas renderer.
 * - "xterm": the original xterm.js stack (WebGL/DOM renderers + addons), kept
 *   as a fallback behind the "terminal-engine" localStorage flag.
 *
 * Downstream code (hooks, handlers, UI) only sees `TerminalInstance`, a
 * structural interface both engines satisfy. Engine-specific behavior lives in
 * helpers.ts (construction) and the helpers exported here.
 */

export type TerminalEngineKind = "ghostty" | "xterm";

/** Theme shape shared by both engines (xterm's ITheme is the superset). */
export type TerminalTheme = ITheme;

/** Full xterm.js constructor options (used only by the xterm engine path). */
export type { ITerminalOptions as XtermTerminalOptions } from "@xterm/xterm";

export interface TerminalDisposable {
	dispose(): void;
}

export type TerminalEvent<T> = (
	listener: (arg: T) => void,
) => TerminalDisposable;

export interface TerminalBufferLine {
	readonly length: number;
	readonly isWrapped: boolean;
	translateToString(
		trimRight?: boolean,
		startColumn?: number,
		endColumn?: number,
	): string;
}

export interface TerminalBuffer {
	readonly type: "normal" | "alternate";
	readonly cursorX: number;
	readonly cursorY: number;
	readonly viewportY: number;
	readonly baseY: number;
	readonly length: number;
	getLine(y: number): TerminalBufferLine | undefined;
}

export interface TerminalBufferNamespace {
	readonly active: TerminalBuffer;
	readonly normal: TerminalBuffer;
	readonly alternate: TerminalBuffer;
}

/** Link shape produced by our providers (xterm-style, 1-based coordinates). */
export interface TerminalLink {
	text: string;
	range: {
		start: { x: number; y: number };
		end: { x: number; y: number };
	};
	activate(event: MouseEvent, text: string): void;
	hover?(event: MouseEvent, text: string): void;
	dispose?(): void;
}

/** Link provider contract (xterm-style: 1-based bufferLineNumber). */
export interface TerminalLinkProvider {
	provideLinks(
		bufferLineNumber: number,
		callback: (links: TerminalLink[] | undefined) => void,
	): void;
}

/** Modes downstream code reads (see getTerminalModes). */
export interface TerminalModes {
	readonly bracketedPasteMode: boolean;
}

/**
 * Structural surface of ghostty-web's CanvasRenderer that engine helpers use.
 * xterm terminals simply don't have a `renderer` member.
 */
export interface GhosttyRendererHandle {
	setTheme(theme: TerminalTheme): void;
	render(
		buffer: unknown,
		forceAll?: boolean,
		viewportY?: number,
		scrollbackProvider?: unknown,
		scrollbarOpacity?: number,
	): void;
	readonly charWidth: number;
	readonly charHeight: number;
}

/**
 * The structural interface of what downstream code actually uses from a
 * terminal. Both `@xterm/xterm`'s Terminal and ghostty-web's Terminal are
 * assignable to it.
 *
 * Optional members are engine-specific surfaces:
 * - xterm-only: `modes`, `refresh`, `onWriteParsed`
 * - ghostty-only: `getMode`, `getViewportY`, `renderer`, `wasmTerm`
 */
export interface TerminalInstance {
	// Dimensions / DOM
	readonly cols: number;
	readonly rows: number;
	readonly element?: HTMLElement | undefined;
	readonly textarea?: HTMLTextAreaElement | undefined;
	readonly buffer: TerminalBufferNamespace;
	options: {
		theme?: TerminalTheme;
		fontFamily?: string;
		fontSize?: number;
	};

	// I/O
	open(parent: HTMLElement): void;
	write(data: string, callback?: () => void): void;
	writeln(data: string, callback?: () => void): void;
	paste(text: string): void;
	clear(): void;
	focus(): void;
	dispose(): void;

	// Scrolling
	scrollLines(amount: number): void;
	scrollToBottom(): void;

	// Selection
	getSelection(): string;
	hasSelection(): boolean;
	selectAll(): void;
	clearSelection(): void;

	// Events
	onData: TerminalEvent<string>;
	onKey: TerminalEvent<{ key: string; domEvent: KeyboardEvent }>;
	onResize: TerminalEvent<{ cols: number; rows: number }>;
	onBell: TerminalEvent<void>;
	onTitleChange: TerminalEvent<string>;
	onSelectionChange: TerminalEvent<void>;
	onScroll: TerminalEvent<number>;
	onRender: TerminalEvent<{ start: number; end: number }>;

	// Input plumbing
	attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
	registerLinkProvider(provider: TerminalLinkProvider): void;

	// xterm-only surfaces
	readonly modes?: TerminalModes;
	refresh?(start: number, end: number): void;
	onWriteParsed?: TerminalEvent<void>;

	// ghostty-only surfaces
	getMode?(mode: number, isAnsi?: boolean): boolean;
	getViewportY?(): number;
	readonly renderer?: GhosttyRendererHandle;
	readonly wasmTerm?: unknown;
}

/** Structural fit-addon handle; both engines' FitAddons satisfy it. */
export interface FitHandle {
	fit(): void;
	dispose?(): void;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResultsSummary {
	resultIndex: number;
	resultCount: number;
}

export interface TerminalSearchDecorations {
	matchBackground?: string;
	matchBorder?: string;
	matchOverviewRuler: string;
	activeMatchBackground?: string;
	activeMatchBorder?: string;
	activeMatchColorOverviewRuler: string;
}

export interface TerminalSearchOptions {
	caseSensitive?: boolean;
	regex?: boolean;
	/** Only honored by the xterm engine; ghostty degrades gracefully. */
	decorations?: TerminalSearchDecorations;
}

/** Engine-agnostic search surface consumed by the search UI. */
export interface SearchHandle {
	findNext(query: string, options?: TerminalSearchOptions): boolean;
	findPrevious(query: string, options?: TerminalSearchOptions): boolean;
	clearDecorations(): void;
	onDidChangeResults(
		listener: (results: SearchResultsSummary) => void,
	): TerminalDisposable;
	dispose(): void;
}

// ---------------------------------------------------------------------------
// Engine selection / initialization
// ---------------------------------------------------------------------------

export const TERMINAL_ENGINE_STORAGE_KEY = "terminal-engine";

let ghosttyInitPromise: Promise<boolean> | null = null;
let ghosttyReady = false;
let ghosttyFailed = false;

/** Whether ghostty-web's WASM module finished initializing. */
export function isGhosttyReady(): boolean {
	return ghosttyReady;
}

/**
 * Lazily initialize ghostty-web's WASM module (once per session).
 * Resolves false (and pins the engine to xterm) if initialization fails.
 */
export function ensureGhosttyReady(): Promise<boolean> {
	if (ghosttyInitPromise) return ghosttyInitPromise;
	ghosttyInitPromise = initGhostty()
		.then(() => {
			ghosttyReady = true;
			return true;
		})
		.catch((error) => {
			ghosttyFailed = true;
			console.error(
				"[Terminal] ghostty-web failed to initialize; falling back to xterm.js:",
				error,
			);
			return false;
		});
	return ghosttyInitPromise;
}

/**
 * Read the preferred terminal engine from localStorage.
 * Defaults to "ghostty"; returns "xterm" if ghostty init failed this session.
 */
export function getPreferredEngine(): TerminalEngineKind {
	if (ghosttyFailed) {
		return "xterm";
	}

	try {
		const stored = localStorage.getItem(TERMINAL_ENGINE_STORAGE_KEY);
		if (stored === "ghostty" || stored === "xterm") {
			return stored;
		}
	} catch {
		// ignore storage errors
	}

	return "ghostty";
}

// ---------------------------------------------------------------------------
// Engine-agnostic helpers
// ---------------------------------------------------------------------------

/**
 * Apply a theme to a live terminal.
 *
 * - xterm: mutating `options.theme` is the supported mechanism.
 * - ghostty: `options.theme` mutation after open() is not supported (the
 *   library only warns), but its Terminal exposes the canvas renderer, whose
 *   `setTheme()` updates default colors + palette. We then force a full
 *   repaint via the renderer's public `render(buffer, forceAll=true)` path so
 *   the new colors show without waiting for dirty rows.
 */
export function setTerminalTheme(
	term: TerminalInstance,
	theme: TerminalTheme,
): void {
	const ghosttyRenderer = term.renderer;
	if (ghosttyRenderer) {
		ghosttyRenderer.setTheme(theme);
		if (term.wasmTerm) {
			ghosttyRenderer.render(
				term.wasmTerm,
				true,
				term.getViewportY?.() ?? 0,
				term,
			);
		}
		return;
	}
	term.options.theme = theme;
}

/**
 * Read the terminal modes downstream code cares about.
 *
 * - xterm: exposed directly via `term.modes`.
 * - ghostty: synthesized from `getMode()` (DEC mode 2004 = bracketed paste).
 */
export function getTerminalModes(term: TerminalInstance): TerminalModes {
	if (term.getMode) {
		return { bracketedPasteMode: term.getMode(2004, false) };
	}
	return term.modes ?? { bracketedPasteMode: false };
}

/**
 * Whether the viewport is scrolled to the bottom of the scrollback.
 *
 * The engines expose opposite conventions:
 * - xterm: `buffer.active.viewportY` is the top line index; at bottom it
 *   equals `baseY`.
 * - ghostty: `getViewportY()` counts lines scrolled up from the bottom
 *   (0 = at bottom) and its buffer namespace always reports viewportY/baseY
 *   as 0.
 */
export function isScrolledToBottom(term: TerminalInstance): boolean {
	if (term.getViewportY) {
		return term.getViewportY() < 1;
	}
	const buffer = term.buffer.active;
	return buffer.viewportY >= buffer.baseY;
}

/**
 * Adapts an xterm-style custom key-event handler for ghostty-web.
 *
 * The two engines invert the meaning of the handler's return value:
 * - xterm.js: return `true` to let the terminal PROCESS the key (send to the
 *   PTY); `false` to swallow it (the app handled it, e.g. a hotkey).
 * - ghostty-web: returns truthy => SWALLOW the key (preventDefault + return,
 *   never firing onData); falsy => process it.
 *
 * Wiring an xterm-style handler onto ghostty unchanged makes every ordinary
 * key return `true`, which ghostty reads as "swallow", leaving the terminal
 * input-dead. Inverting the return value restores correct behavior.
 */
export function adaptKeyHandlerForGhostty(
	handler: (event: KeyboardEvent) => boolean,
): (event: KeyboardEvent) => boolean {
	return (event: KeyboardEvent) => !handler(event);
}

/**
 * Force the terminal to repaint its current buffer.
 *
 * xterm re-renders on visibility/resize on its own; `refresh()` is its
 * imperative repaint. ghostty renders to a canvas and does NOT necessarily
 * repaint when it becomes visible again or when a resize doesn't change the
 * cell grid — so after a tab switch / re-mount its canvas can sit blank until
 * new output arrives. Forcing a full render (`render(..., forceAll=true)`)
 * paints the restored buffer immediately.
 */
export function redrawTerminal(term: TerminalInstance): void {
	const ghosttyRenderer = term.renderer;
	if (ghosttyRenderer && term.wasmTerm) {
		ghosttyRenderer.render(term.wasmTerm, true, term.getViewportY?.() ?? 0, term);
		return;
	}
	term.refresh?.(0, Math.max(0, term.rows - 1));
}
