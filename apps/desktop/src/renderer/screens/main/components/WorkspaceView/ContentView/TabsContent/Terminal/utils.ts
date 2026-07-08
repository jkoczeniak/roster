import {
	DEFAULT_PERMISSION_MODE,
	type PermissionMode,
} from "@roster/shared/agent-command";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { quote } from "shell-quote";
import type { TerminalInstance } from "./engine";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

/**
 * Build the `claude --resume` command for the auto-resume paths, honoring the
 * global permission posture (Settings → Agent autonomy) exactly like a fresh
 * session launch does. Resume used to hardcode --dangerously-skip-permissions,
 * silently upgrading "guarded" users to full autonomy. Any failure to read the
 * setting falls back to guarded — never grant autonomy on error.
 */
export async function buildClaudeResumeCommand(
	sessionId: string,
): Promise<string> {
	let mode: PermissionMode = DEFAULT_PERMISSION_MODE;
	try {
		mode =
			(await trpcClient.settings.getPermissionMode.query()) ??
			DEFAULT_PERMISSION_MODE;
	} catch {
		// Unreadable setting → guarded.
	}
	const parts = ["claude", "--resume", sessionId];
	if (mode === "auto") parts.push("--dangerously-skip-permissions");
	return parts.join(" ");
}

export function scrollToBottom(terminal: TerminalInstance): void {
	terminal.scrollToBottom();
}
