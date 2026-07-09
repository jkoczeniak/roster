import { Button } from "@roster/ui/button";
import { cn } from "@roster/ui/utils";
import { LuFolderPlus } from "react-icons/lu";
import { RosterLogo } from "renderer/components/RosterLogo";
import { useOpenNewCategoryModal } from "renderer/stores/new-category-modal";
import { PreflightCard } from "./PreflightCard";

/**
 * First-run / empty onboarding. Roster is where you build agents with a
 * persona and a memory that grows; teams are just the grouping, so the entry
 * action is "Create a team", then agents are added inside it via the New
 * Agent modal.
 */
export function StartView() {
	const openNewCategory = useOpenNewCategoryModal();

	return (
		<div className="flex flex-col h-full w-full relative overflow-hidden bg-background">
			<div className="relative flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-md px-6">
					<RosterLogo className={cn("h-8 w-auto mb-6 opacity-80")} />
					<p className="text-sm text-muted-foreground text-center mb-8 max-w-sm">
						Build a roster of agents — each with its own role, memory, skills,
						and connectors. They learn as you work with them.
					</p>

					<div className="w-full flex flex-col items-center gap-4">
						<button
							type="button"
							onClick={() => openNewCategory()}
							className={cn(
								"w-full rounded-xl border-2 border-dashed border-border/60 bg-card/50 px-6 py-16",
								"transition-all duration-200 hover:border-primary/40 hover:bg-accent/50",
								"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							)}
						>
							<div className="flex flex-col items-center group">
								<div className="flex items-center gap-3">
									<LuFolderPlus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
									<span className="text-lg font-medium text-foreground">
										Create a team
									</span>
								</div>
								<div className="text-sm pt-3 text-muted-foreground">
									Teams group your agents — Home, Work, a project. Your first
									agent comes next.
								</div>
							</div>
						</button>

						<Button
							variant="outline"
							size="sm"
							onClick={() => openNewCategory()}
							className="text-sm"
						>
							<LuFolderPlus className="size-3.5" />
							New team
						</Button>

						<PreflightCard />
					</div>
				</div>
			</div>
		</div>
	);
}
