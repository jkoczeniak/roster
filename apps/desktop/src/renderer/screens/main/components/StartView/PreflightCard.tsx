import {
	BINARY_INSTALL,
	CHECKED_BINARIES,
	type CheckedBinary,
} from "@roster/shared/agent-binaries";
import { Button } from "@roster/ui/button";
import { useState } from "react";
import { HiOutlineCheck, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { BinaryInstallDialog } from "renderer/components/BinaryInstallDialog/BinaryInstallDialog";
import { useRuntimeAvailability } from "renderer/stores/model-bar/useRuntimeAvailability";

/**
 * First-run preflight: whether the CLIs Roster shells out to (claude, codex,
 * git) are installed, so a non-developer installs what's missing before ever
 * reaching a dead terminal. Quiet by design — renders nothing until the probe
 * lands (no "missing" flash) and collapses to a one-line "All set" when
 * everything is found.
 */
export function PreflightCard() {
	const { availability, recheck, isFetching } = useRuntimeAvailability();
	const [installBinary, setInstallBinary] = useState<CheckedBinary | null>(
		null,
	);

	if (!availability) return null;

	const allInstalled = CHECKED_BINARIES.every((binary) => availability[binary]);

	if (allInstalled) {
		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<HiOutlineCheck className="h-3.5 w-3.5" />
				All set — Claude Code, Codex, and Git detected
			</div>
		);
	}

	return (
		<div className="w-full rounded-lg border border-border/60 bg-card/50 px-4 py-3">
			<p className="pb-1.5 text-xs font-medium text-muted-foreground">
				Roster runs these tools on your machine
			</p>
			<div className="flex flex-col divide-y divide-border/40">
				{CHECKED_BINARIES.map((binary) => {
					const installed = availability[binary];
					return (
						<div
							key={binary}
							className="flex items-center gap-2 py-1.5 text-sm"
						>
							{installed ? (
								<HiOutlineCheck className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
							) : (
								<HiOutlineExclamationTriangle className="h-4 w-4 shrink-0 text-amber-500" />
							)}
							<span className="flex-1 text-left text-foreground">
								{BINARY_INSTALL[binary].label}
							</span>
							{installed ? (
								<span className="text-xs text-muted-foreground">Installed</span>
							) : (
								<Button
									variant="outline"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => setInstallBinary(binary)}
								>
									Install
								</Button>
							)}
						</div>
					);
				})}
			</div>

			<BinaryInstallDialog
				binary={installBinary}
				onOpenChange={(open) => !open && setInstallBinary(null)}
				onRecheck={recheck}
				isRechecking={isFetching}
			/>
		</div>
	);
}
