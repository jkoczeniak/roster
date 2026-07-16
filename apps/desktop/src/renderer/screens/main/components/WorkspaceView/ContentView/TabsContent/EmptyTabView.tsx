import { Button } from "@roster/ui/button";
import { Kbd, KbdGroup } from "@roster/ui/kbd";
import { useParams } from "@tanstack/react-router";
import { HiMiniCommandLine } from "react-icons/hi2";
import { BinaryInstallDialog } from "renderer/components/BinaryInstallDialog/BinaryInstallDialog";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";
import { useAgentSession } from "renderer/stores/tabs/useAgentSession";

export function EmptyTabView() {
	const { workspaceId } = useParams({ strict: false });
	const newGroupDisplay = useHotkeyDisplay("NEW_GROUP");
	const openInAppDisplay = useHotkeyDisplay("OPEN_IN_APP");
	const {
		spawnAgentSession,
		missingBinary,
		dismissMissingBinary,
		recheckAvailability,
		isRecheckingAvailability,
	} = useAgentSession();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);

	// Same spawn path as GroupStrip's "+" button: the agent's runtime CLI in its
	// worktree, falling back to a plain shell when no runtime is configured.
	const handleStartSession = () => {
		if (!workspaceId) return;
		spawnAgentSession({
			id: workspaceId,
			runtime: workspace?.runtime ?? null,
			worktreePath: workspace?.worktreePath ?? null,
			permissionMode: workspace?.permissionMode ?? null,
		});
	};

	const shortcuts = [
		{ label: "New Terminal", display: newGroupDisplay },
		{ label: "Open in App", display: openInAppDisplay },
	];

	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-6 h-full">
			<div className="p-4 rounded-lg bg-muted border border-border">
				<HiMiniCommandLine className="size-8 text-muted-foreground" />
			</div>

			<p className="text-sm text-muted-foreground">No session running</p>

			{workspaceId && (
				<Button size="sm" onClick={handleStartSession}>
					Start a session
				</Button>
			)}

			<div className="flex items-center gap-4 text-xs text-muted-foreground">
				{shortcuts.map((shortcut) => (
					<div key={shortcut.label} className="flex items-center gap-2">
						<KbdGroup>
							{shortcut.display.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
						<span>{shortcut.label}</span>
					</div>
				))}
			</div>

			<BinaryInstallDialog
				binary={missingBinary}
				onOpenChange={(open) => !open && dismissMissingBinary()}
				onRecheck={recheckAvailability}
				isRechecking={isRecheckingAvailability}
			/>
		</div>
	);
}
