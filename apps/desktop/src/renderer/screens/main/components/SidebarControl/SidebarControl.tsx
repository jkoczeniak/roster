import { Button } from "@roster/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roster/ui/tooltip";
import { cn } from "@roster/ui/utils";
import { LuPanelRight } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useSidebarStore } from "renderer/stores";

/**
 * Toggles the right sidebar — the agent's panel (files, persona/memory/skills,
 * connectors). Labeled "Agent", not "Code": the panel is the agent's identity
 * surface first, and a file tree second.
 */
export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					onClick={toggleSidebar}
					aria-label={
						isSidebarOpen ? "Hide Agent Sidebar" : "Show Agent Sidebar"
					}
					aria-pressed={isSidebarOpen}
					className={cn(
						"no-drag gap-1.5 h-6 px-1.5 rounded",
						isSidebarOpen
							? "font-semibold text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<LuPanelRight className="size-3" />
					<span className="text-xs">Agent</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<HotkeyTooltipContent
					label="Open Agent Sidebar"
					hotkeyId="TOGGLE_SIDEBAR"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
