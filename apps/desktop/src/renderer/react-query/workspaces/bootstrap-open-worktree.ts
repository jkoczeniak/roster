import {
	buildTerminalCommand,
	writeCommandInPane,
} from "renderer/lib/terminal/launch-command";
import { useWorkspaceTrustDialogStore } from "renderer/stores/workspace-trust-dialog";

interface OpenWorkspaceData {
	workspace: { id: string };
	/**
	 * Setup commands the main process approved for auto-run — populated ONLY for
	 * a trusted root. Untrusted repos always arrive with this `null`, so this
	 * path can never auto-run untrusted commands.
	 */
	initialCommands?: string[] | null;
	/**
	 * Setup commands the main process withheld because the root is untrusted.
	 * Surfaced in the trust prompt (review + opt-in); never auto-run.
	 */
	untrustedSetupCommands?: string[] | null;
	/** Resolved repo root — the workspace-trust allow-list key. */
	mainRepoRoot?: string | null;
	/** Whether `mainRepoRoot` is currently trusted. */
	trusted?: boolean;
}

export type BootstrapOpenWorktreeError =
	| "create_or_attach_failed"
	| "write_initial_commands_failed";

interface BootstrapOpenWorktreeOptions {
	data: OpenWorkspaceData;
	addTab: (workspaceId: string) => { tabId: string; paneId: string };
	setTabAutoTitle: (tabId: string, title: string) => void;
	createOrAttach: (input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
	}) => Promise<unknown>;
	writeToTerminal: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
	/** Persist trust for a repo root — required to run withheld setup commands. */
	setTrust?: (input: { root: string }) => Promise<unknown>;
}

/**
 * Open the workspace-trust prompt for setup commands the main process withheld
 * from auto-run, then (on opt-in) persist trust and run them in the SAME pane.
 * Runs from a non-hook module via the zustand store's imperative API.
 */
function promptOpenWorktreeTrust(params: {
	root: string;
	commands: string[];
	paneId: string;
	writeToTerminal: BootstrapOpenWorktreeOptions["writeToTerminal"];
	setTrust: BootstrapOpenWorktreeOptions["setTrust"];
}): void {
	const store = useWorkspaceTrustDialogStore.getState();

	store.open({
		root: params.root,
		commands: params.commands,
		onConfirm: () => {
			const dialog = useWorkspaceTrustDialogStore.getState();
			dialog.setIsPending(true);

			const persistTrust = params.setTrust
				? params.setTrust({ root: params.root })
				: Promise.resolve();

			void persistTrust
				.catch((error) => {
					console.error(
						"[bootstrapOpenWorktree] Failed to persist workspace trust:",
						error,
					);
				})
				.then(() => {
					const setupCommand = buildTerminalCommand(params.commands);
					if (!setupCommand) return;
					return writeCommandInPane({
						paneId: params.paneId,
						command: setupCommand,
						write: params.writeToTerminal,
					});
				})
				.catch((error) => {
					console.error(
						"[bootstrapOpenWorktree] Failed to run setup commands:",
						error,
					);
				})
				.finally(() => {
					useWorkspaceTrustDialogStore.getState().close();
				});
		},
		onSkip: () => {
			// Open the workspace without running the repo's setup commands.
			useWorkspaceTrustDialogStore.getState().close();
		},
	});
}

export async function bootstrapOpenWorktree(
	options: BootstrapOpenWorktreeOptions,
): Promise<BootstrapOpenWorktreeError | null> {
	// initialCommands is ONLY ever populated for a trusted root (the main process
	// nulls it otherwise), so this auto-run source is safe by construction.
	const setupCommand = buildTerminalCommand(options.data.initialCommands);

	const untrustedCommands =
		Array.isArray(options.data.untrustedSetupCommands) &&
		options.data.untrustedSetupCommands.length > 0
			? options.data.untrustedSetupCommands
			: null;

	const { tabId, paneId } = options.addTab(options.data.workspace.id);
	if (setupCommand || untrustedCommands) {
		options.setTabAutoTitle(tabId, "Workspace Setup");
	}

	try {
		await options.createOrAttach({
			paneId,
			tabId,
			workspaceId: options.data.workspace.id,
		});
	} catch (error) {
		console.error("[bootstrapOpenWorktree] Failed to create or attach:", error);
		return "create_or_attach_failed";
	}

	if (setupCommand) {
		try {
			await writeCommandInPane({
				paneId,
				command: setupCommand,
				write: options.writeToTerminal,
			});
		} catch (error) {
			console.error(
				"[bootstrapOpenWorktree] Failed to write initial commands:",
				error,
			);
			return "write_initial_commands_failed";
		}
		return null;
	}

	// Untrusted repo with setup commands: they were NEVER auto-run above. Surface
	// the same workspace-trust prompt the create path uses so the user can review
	// and opt in — instead of silently dropping them.
	if (untrustedCommands && options.data.mainRepoRoot) {
		promptOpenWorktreeTrust({
			root: options.data.mainRepoRoot,
			commands: untrustedCommands,
			paneId,
			writeToTerminal: options.writeToTerminal,
			setTrust: options.setTrust,
		});
	}

	return null;
}
