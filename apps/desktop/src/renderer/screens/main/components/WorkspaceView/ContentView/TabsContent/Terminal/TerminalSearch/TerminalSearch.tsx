import { Tooltip, TooltipContent, TooltipTrigger } from "@roster/ui/tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";
import type {
	SearchHandle,
	SearchResultsSummary,
	TerminalSearchOptions,
} from "../engine";

interface TerminalSearchProps {
	search: SearchHandle | null;
	isOpen: boolean;
	onClose: () => void;
}

const SEARCH_DECORATIONS: TerminalSearchOptions["decorations"] = {
	matchBackground: "#515c6a",
	matchBorder: "#74879f",
	matchOverviewRuler: "#d186167e",
	activeMatchBackground: "#515c6a",
	activeMatchBorder: "#ffd33d",
	activeMatchColorOverviewRuler: "#ffd33d",
};

export function TerminalSearch({
	search,
	isOpen,
	onClose,
}: TerminalSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [matchCount, setMatchCount] = useState<number | null>(null);
	const [results, setResults] = useState<SearchResultsSummary | null>(null);
	const [caseSensitive, setCaseSensitive] = useState(false);

	const searchOptions: TerminalSearchOptions = useMemo(
		() => ({
			caseSensitive,
			regex: false,
			decorations: SEARCH_DECORATIONS,
		}),
		[caseSensitive],
	);

	// Focus input when search opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	// Clear search highlighting when closing
	useEffect(() => {
		if (!isOpen && search) {
			search.clearDecorations();
			setResults(null);
		}
	}, [isOpen, search]);

	// Track match counts (exact counts on ghostty; xterm reports them when
	// decorations are enabled).
	useEffect(() => {
		if (!search) return;
		const disposable = search.onDidChangeResults((event) => {
			setResults(event.resultCount > 0 ? event : null);
		});
		return () => disposable.dispose();
	}, [search]);

	const handleSearch = useCallback(
		(direction: "next" | "previous") => {
			if (!search || !query) return;

			const found =
				direction === "next"
					? search.findNext(query, searchOptions)
					: search.findPrevious(query, searchOptions);

			setMatchCount(found ? 1 : 0);
		},
		[search, query, searchOptions],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;
		setQuery(newQuery);

		if (search && newQuery) {
			const found = search.findNext(newQuery, searchOptions);
			setMatchCount(found ? 1 : 0);
		} else {
			setMatchCount(null);
			setResults(null);
			search?.clearDecorations();
		}
	};

	const toggleCaseSensitive = () => {
		setCaseSensitive((prev) => !prev);
	};

	// Re-run search when case sensitivity changes
	useEffect(() => {
		if (search && query) {
			const found = search.findNext(query, searchOptions);
			setMatchCount(found ? 1 : 0);
		}
	}, [search, query, searchOptions]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				handleSearch("previous");
			} else {
				handleSearch("next");
			}
		}
	};

	const handleClose = () => {
		setQuery("");
		setMatchCount(null);
		setResults(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-1 right-1 z-10 flex items-center max-w-[calc(100%-0.5rem)] rounded bg-popover/95 pl-2 pr-0.5 shadow-lg ring-1 ring-border/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder="Find"
				className="h-6 min-w-0 w-28 flex-shrink bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{matchCount === 0 && query && (
				<span className="text-xs text-muted-foreground whitespace-nowrap px-1">
					No results
				</span>
			)}
			{matchCount !== 0 && query && results && (
				<span className="text-xs text-muted-foreground whitespace-nowrap px-1">
					{results.resultIndex >= 0
						? `${results.resultIndex + 1} of ${results.resultCount}`
						: `${results.resultCount}`}
				</span>
			)}
			<div className="flex items-center shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={toggleCaseSensitive}
							className={`rounded p-1 transition-colors ${
								caseSensitive
									? "bg-primary/20 text-foreground"
									: "text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
							}`}
						>
							<PiTextAa className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Match case</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("previous")}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronUp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Previous (Shift+Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSearch("next")}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Next (Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClose}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Close (Esc)</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
