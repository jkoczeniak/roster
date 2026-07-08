import {
	type AgentBinary,
	type CheckedBinary,
	RUNTIME_BINARY,
} from "@roster/shared/agent-binaries";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roster/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { BinaryInstallDialog } from "renderer/components/BinaryInstallDialog/BinaryInstallDialog";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRuntimeAvailability } from "renderer/stores/model-bar/useRuntimeAvailability";
import { useAgentSession } from "renderer/stores/tabs/useAgentSession";
import {
	iconNameForRuntime,
	MODEL_VARIANTS,
	type ModelVariant,
} from "./models";

/**
 * A quiet row of model variants below the session tab strip. Clicking a variant
 * opens a new session in the current agent's worktree running that runtime's
 * CLI with the variant's model (permission mode comes from Settings → Features).
 */
export function ModelBar() {
	const { workspaceId } = useParams({ strict: false });
	const isDark = useIsDarkTheme();
	const { spawnAgentSession } = useAgentSession();
	const { isAvailable, recheck, isFetching } = useRuntimeAvailability();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId! },
		{ enabled: !!workspaceId },
	);

	const [installBinary, setInstallBinary] = useState<AgentBinary | null>(null);

	// Close the install dialog once a re-check confirms the tool is now present.
	useEffect(() => {
		if (installBinary && isAvailable(installBinary as CheckedBinary)) {
			setInstallBinary(null);
		}
	}, [installBinary, isAvailable]);

	if (!workspaceId) return null;

	const worktreePath = workspace?.worktreePath ?? null;
	const ready = !!worktreePath;

	const handleVariantClick = (variant: ModelVariant) => {
		if (!ready) return;
		// Availability gate: the runtime's binary must be present before spawning.
		const binary = RUNTIME_BINARY[variant.runtime];
		if (!isAvailable(binary as CheckedBinary)) {
			setInstallBinary(binary);
			return;
		}
		spawnAgentSession(
			{
				id: workspaceId,
				runtime: variant.runtime,
				worktreePath,
			},
			{
				id: variant.id,
				label: variant.label,
				model: variant.model,
				reasoningEffort: variant.reasoningEffort,
			},
		);
	};

	return (
		<div className="flex h-9 shrink-0 items-center gap-0.5 border-b bg-background px-2">
			<div
				className={`flex items-center gap-0.5 ${
					ready ? "" : "pointer-events-none opacity-40"
				}`}
			>
				{MODEL_VARIANTS.map((variant) => {
					const icon = getPresetIcon(
						iconNameForRuntime(variant.runtime),
						isDark,
					);
					const binary = RUNTIME_BINARY[variant.runtime];
					const missing = !isAvailable(binary as CheckedBinary);
					return (
						<Tooltip key={variant.id}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={
										missing
											? `${variant.description} — not detected, click to install`
											: `New session — ${variant.description}`
									}
									disabled={!ready}
									onClick={() => handleVariantClick(variant)}
									className={`group relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
										variant.isDefault && !missing ? "text-foreground" : ""
									}`}
								>
									{icon ? (
										<img
											src={icon}
											alt=""
											className={`h-4 w-4 object-contain transition-opacity group-hover:opacity-100 ${
												missing
													? "opacity-30 grayscale group-hover:opacity-60"
													: variant.isDefault
														? "opacity-90"
														: "opacity-55"
											}`}
										/>
									) : (
										<span className="text-[10px] text-muted-foreground">
											{variant.label.slice(0, 2)}
										</span>
									)}
									<span>{variant.label}</span>
									{missing && (
										<span className="absolute -right-px -top-px h-[5px] w-[5px] rounded-full bg-amber-500 ring-1 ring-background" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{missing
									? `${variant.description} — not detected, click to install`
									: `${variant.description}${variant.isDefault ? " · default" : ""}`}
							</TooltipContent>
						</Tooltip>
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
