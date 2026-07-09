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
 * same posture resolution as a fresh session launch: the workspace's per-agent
 * permission override first, then the global default (Settings → Behavior).
 * Resume used to hardcode --dangerously-skip-permissions, silently upgrading
 * "guarded" users to full autonomy. Any failure to read either value falls
 * back to guarded — never grant autonomy on error.
 */
export async function buildClaudeResumeCommand(
	sessionId: string,
	workspaceId?: string,
): Promise<string> {
	let mode: PermissionMode = DEFAULT_PERMISSION_MODE;
	try {
		const [globalMode, workspace] = await Promise.all([
			trpcClient.settings.getPermissionMode.query(),
			workspaceId
				? trpcClient.workspaces.get.query({ id: workspaceId })
				: Promise.resolve(null),
		]);
		mode = workspace?.permissionMode ?? globalMode ?? DEFAULT_PERMISSION_MODE;
	} catch {
		// Unreadable setting or workspace → guarded.
	}
	const parts = ["claude", "--resume", sessionId];
	if (mode === "auto") parts.push("--dangerously-skip-permissions");
	return parts.join(" ");
}

export function scrollToBottom(terminal: TerminalInstance): void {
	terminal.scrollToBottom();
}
