import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@roster/ui/alert-dialog";
import { Button } from "@roster/ui/button";
import { useWorkspaceTrustDialogStore } from "renderer/stores/workspace-trust-dialog";

/**
 * Workspace-trust confirmation. A repo's `.roster/config.json` can declare
 * `setup` commands that run in a real PTY (outside the agent sandbox) the moment
 * a workspace opens. For a repo root the user hasn't trusted yet, we surface the
 * exact commands here instead of auto-running them, mirroring VS Code's
 * Workspace Trust prompt. Mounted at app root so it survives dialog unmounts.
 */
export function WorkspaceTrustDialog() {
	const { isOpen, isPending, root, commands, onConfirm, onSkip } =
		useWorkspaceTrustDialogStore();

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				// Dismissing (Esc / outside click) is the safe default: skip setup.
				if (!open && !isPending) onSkip?.();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Run setup commands from this folder?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>
								This folder wants to run setup commands on your machine when it
								opens (declared in{" "}
								<span className="font-mono text-xs">.roster/config.json</span>,
								run directly on your Mac). Only continue if you trust where it
								came from.
							</p>
							<p className="font-mono text-xs break-all text-muted-foreground">
								{root}
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-all select-text">
					{commands.join("\n")}
				</pre>
				<AlertDialogFooter>
					<Button
						variant="outline"
						disabled={isPending}
						onClick={() => onSkip?.()}
					>
						Skip
					</Button>
					<Button disabled={isPending} onClick={() => onConfirm?.()}>
						{isPending ? "Starting..." : "Run and trust this folder"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
