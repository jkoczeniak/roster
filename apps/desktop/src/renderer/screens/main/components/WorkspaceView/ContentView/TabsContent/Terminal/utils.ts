import { quote } from "shell-quote";
import type { TerminalInstance } from "./engine";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export function scrollToBottom(terminal: TerminalInstance): void {
	terminal.scrollToBottom();
}
