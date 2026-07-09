import {
	type CheckedBinary,
	RUNTIME_BINARY,
} from "@roster/shared/agent-binaries";
import {
	DEFAULT_PERMISSION_MODE,
	type PermissionMode,
} from "@roster/shared/agent-command";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@roster/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roster/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { HiBolt, HiOutlineShieldCheck } from "react-icons/hi2";
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
 * CLI with the variant's model. The right edge shows the agent's permission
 * posture for new sessions: the per-agent override when set, otherwise the
 * global default (Settings → Behavior → Default agent autonomy).
 */
export function ModelBar() {
	const { workspaceId } = useParams({ strict: false });
	const isDark = useIsDarkTheme();
	const {
		spawnAgentSession,
		missingBinary,
		dismissMissingBinary,
		recheckAvailability,
		isRecheckingAvailability,
	} = useAgentSession();
	const { isAvailable } = useRuntimeAvailability();
	const utils = electronTrpc.useUtils();

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId! },
		{ enabled: !!workspaceId },
	);
	// Global default posture; guarded while loading (same fallback as launch).
	const { data: globalPermissionMode } =
		electronTrpc.settings.getPermissionMode.useQuery();
	const setPermissionMode =
		electronTrpc.workspaces.setPermissionMode.useMutation({
			onSuccess: () => {
				utils.workspaces.get.invalidate({ id: workspaceId! });
			},
		});

	if (!workspaceId) return null;

	const worktreePath = workspace?.worktreePath ?? null;
	const ready = !!worktreePath;

	const globalMode = globalPermissionMode ?? DEFAULT_PERMISSION_MODE;
	const overrideMode = workspace?.permissionMode ?? null;
	const effectiveMode = overrideMode ?? globalMode;
	const globalModeLabel = globalMode === "auto" ? "Full autonomy" : "Guarded";

	const handleVariantClick = (variant: ModelVariant) => {
		if (!ready) return;
		// spawnAgentSession gates on binary availability and opens the install
		// dialog (missingBinary) itself when the runtime isn't installed.
		spawnAgentSession(
			{
				id: workspaceId,
				runtime: variant.runtime,
				worktreePath,
				permissionMode: overrideMode,
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

			{/* Per-agent permission posture for new sessions. Effective mode is
			    always visible; "auto" is deliberately loud (amber) so a session
			    launching without approval prompts is never a surprise. */}
			<div className="ml-auto">
				<Select
					value={overrideMode ?? "default"}
					onValueChange={(value) =>
						setPermissionMode.mutate({
							id: workspaceId,
							mode: value === "default" ? null : (value as PermissionMode),
						})
					}
					disabled={setPermissionMode.isPending}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<SelectTrigger
								size="sm"
								aria-label="Agent permissions for new sessions"
								className={`w-auto gap-1.5 rounded-md border-none bg-transparent px-2 text-[11px] shadow-none data-[size=sm]:h-7 dark:bg-transparent hover:bg-muted dark:hover:bg-muted ${
									effectiveMode === "auto"
										? "text-amber-500 hover:text-amber-400"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{effectiveMode === "auto" ? (
									<HiBolt className="h-3.5 w-3.5 text-current" />
								) : (
									<HiOutlineShieldCheck className="h-3.5 w-3.5 text-current" />
								)}
								<span>
									{effectiveMode === "auto" ? "Full autonomy" : "Guarded"}
								</span>
							</SelectTrigger>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{overrideMode
								? "Permissions for this agent's new sessions (overrides the app default)"
								: `Permissions for this agent's new sessions — using the app default (${globalModeLabel})`}
						</TooltipContent>
					</Tooltip>
					<SelectContent align="end">
						<SelectItem value="default">Default ({globalModeLabel})</SelectItem>
						<SelectItem value="guarded">Guarded</SelectItem>
						<SelectItem value="auto">Full autonomy</SelectItem>
					</SelectContent>
				</Select>
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
