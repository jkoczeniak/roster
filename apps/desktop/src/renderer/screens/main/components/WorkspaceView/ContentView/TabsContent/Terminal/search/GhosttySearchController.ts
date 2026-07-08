import type {
	SearchHandle,
	SearchResultsSummary,
	TerminalDisposable,
	TerminalInstance,
	TerminalSearchOptions,
} from "../engine";

interface SearchMatch {
	/** Absolute buffer row (0 = top of scrollback). */
	row: number;
	col: number;
	length: number;
}

/**
 * Search controller for the ghostty engine.
 *
 * ghostty-web has no SearchAddon, so this scans the buffer line API
 * (`buffer.active.getLine(y).translateToString()`), maintains the match list
 * and active index, scrolls the active match into view, and emits
 * onDidChangeResults({ resultIndex, resultCount }) so the UI's match counter
 * works. Match decorations degrade gracefully (ghostty's canvas renderer has
 * no decoration API, and its `select()` coordinate handling is unreliable
 * across scrollback, so the active match is not visually highlighted).
 */
export class GhosttySearchController implements SearchHandle {
	private matches: SearchMatch[] = [];
	private activeIndex = -1;
	private lastQuery = "";
	private lastCaseSensitive = false;
	private lastRegex = false;
	private readonly listeners = new Set<
		(results: SearchResultsSummary) => void
	>();
	private isDisposed = false;

	constructor(private readonly terminal: TerminalInstance) {}

	findNext(query: string, options?: TerminalSearchOptions): boolean {
		return this.find(query, options, 1);
	}

	findPrevious(query: string, options?: TerminalSearchOptions): boolean {
		return this.find(query, options, -1);
	}

	clearDecorations(): void {
		this.matches = [];
		this.activeIndex = -1;
		this.lastQuery = "";
		this.emit({ resultIndex: -1, resultCount: 0 });
	}

	onDidChangeResults(
		listener: (results: SearchResultsSummary) => void,
	): TerminalDisposable {
		this.listeners.add(listener);
		return {
			dispose: () => {
				this.listeners.delete(listener);
			},
		};
	}

	dispose(): void {
		this.isDisposed = true;
		this.listeners.clear();
		this.matches = [];
		this.activeIndex = -1;
	}

	private find(
		query: string,
		options: TerminalSearchOptions | undefined,
		direction: 1 | -1,
	): boolean {
		if (this.isDisposed || !query) {
			this.clearDecorations();
			return false;
		}

		const caseSensitive = options?.caseSensitive ?? false;
		const regex = options?.regex ?? false;

		// The buffer can change between searches (new output), so rescan on
		// every navigation. Scrollback is bounded (2000 lines), keeping this
		// cheap relative to a keypress.
		const previousActive =
			this.activeIndex >= 0 ? this.matches[this.activeIndex] : undefined;
		const isSameSearch =
			query === this.lastQuery &&
			caseSensitive === this.lastCaseSensitive &&
			regex === this.lastRegex;

		this.matches = this.collectMatches(query, caseSensitive, regex);
		this.lastQuery = query;
		this.lastCaseSensitive = caseSensitive;
		this.lastRegex = regex;

		if (this.matches.length === 0) {
			this.activeIndex = -1;
			this.emit({ resultIndex: -1, resultCount: 0 });
			return false;
		}

		if (!isSameSearch || !previousActive) {
			// Fresh search: start at the first match at/after the current
			// viewport top so the result feels local, like SearchAddon.
			this.activeIndex = this.findStartIndex(direction);
		} else {
			const anchor = this.findMatchIndex(previousActive);
			if (anchor === -1) {
				this.activeIndex = this.findStartIndex(direction);
			} else {
				this.activeIndex =
					(anchor + direction + this.matches.length) % this.matches.length;
			}
		}

		this.scrollActiveMatchIntoView();
		this.emit({
			resultIndex: this.activeIndex,
			resultCount: this.matches.length,
		});
		return true;
	}

	private collectMatches(
		query: string,
		caseSensitive: boolean,
		regex: boolean,
	): SearchMatch[] {
		const buffer = this.terminal.buffer.active;
		const matches: SearchMatch[] = [];

		let pattern: RegExp | null = null;
		if (regex) {
			try {
				pattern = new RegExp(query, caseSensitive ? "g" : "gi");
			} catch {
				return [];
			}
		}
		const needle = caseSensitive ? query : query.toLowerCase();

		for (let y = 0; y < buffer.length; y++) {
			const line = buffer.getLine(y);
			if (!line) continue;
			const text = line.translateToString(true);
			if (!text) continue;

			if (pattern) {
				pattern.lastIndex = 0;
				for (const match of text.matchAll(pattern)) {
					if (match[0].length === 0) break;
					matches.push({
						row: y,
						col: match.index ?? 0,
						length: match[0].length,
					});
				}
				continue;
			}

			const haystack = caseSensitive ? text : text.toLowerCase();
			let fromIndex = 0;
			while (fromIndex <= haystack.length - needle.length) {
				const index = haystack.indexOf(needle, fromIndex);
				if (index === -1) break;
				matches.push({ row: y, col: index, length: query.length });
				fromIndex = index + Math.max(1, needle.length);
			}
		}

		return matches;
	}

	private findMatchIndex(target: SearchMatch): number {
		return this.matches.findIndex(
			(match) =>
				match.row === target.row &&
				match.col === target.col &&
				match.length === target.length,
		);
	}

	/** First match at/after the current viewport top (wrapping around). */
	private findStartIndex(direction: 1 | -1): number {
		const viewportTop = this.getViewportTopRow();
		if (direction === 1) {
			const index = this.matches.findIndex((match) => match.row >= viewportTop);
			return index === -1 ? 0 : index;
		}
		for (let i = this.matches.length - 1; i >= 0; i--) {
			const match = this.matches[i];
			if (match && match.row <= viewportTop + this.terminal.rows - 1) {
				return i;
			}
		}
		return this.matches.length - 1;
	}

	/** Absolute buffer row currently at the top of the viewport. */
	private getViewportTopRow(): number {
		const buffer = this.terminal.buffer.active;
		const scrollback = Math.max(0, buffer.length - this.terminal.rows);
		const scrolledUp = Math.max(
			0,
			Math.floor(this.terminal.getViewportY?.() ?? 0),
		);
		return scrollback - scrolledUp;
	}

	/**
	 * Scroll the active match into view (roughly centered) using
	 * `scrollLines` (positive = down), computed against ghostty's
	 * lines-scrolled-up-from-bottom viewport convention.
	 */
	private scrollActiveMatchIntoView(): void {
		const match = this.matches[this.activeIndex];
		if (!match) return;

		const buffer = this.terminal.buffer.active;
		const rows = this.terminal.rows;
		const scrollback = Math.max(0, buffer.length - rows);
		const current = Math.max(
			0,
			Math.floor(this.terminal.getViewportY?.() ?? 0),
		);

		// Lines-above-bottom offset that places the match mid-viewport.
		const target = Math.max(
			0,
			Math.min(scrollback, scrollback - match.row + Math.floor(rows / 2)),
		);

		if (target === current) return;
		if (target === 0) {
			this.terminal.scrollToBottom();
			return;
		}
		this.terminal.scrollLines(current - target);
	}

	private emit(results: SearchResultsSummary): void {
		for (const listener of this.listeners) {
			listener(results);
		}
	}
}
