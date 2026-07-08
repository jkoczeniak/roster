import { useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	SidebarMode,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { ResizablePanel } from "../../ResizablePanel";
import { ChangesContent, ScrollProvider } from "../ChangesContent";
import { ContentView } from "../ContentView";
import { useBrowserLifecycle } from "../hooks/useBrowserLifecycle";
import { RightSidebar } from "../RightSidebar";

export function WorkspaceLayout() {
	useBrowserLifecycle();
	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
		currentMode,
	} = useSidebarStore();

	// A folder agent (vcs="none") has no diff/Changes view. Never mount
	// ChangesContent for it, even if the sidebar mode was persisted as Changes
	// from a previous git agent.
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const isRepo = workspace?.isRepo ?? true;

	const isExpanded = isRepo && currentMode === SidebarMode.Changes;

	return (
		<ScrollProvider>
			<div className="flex-1 min-w-0 overflow-hidden">
				{isExpanded ? <ChangesContent /> : <ContentView />}
			</div>
			{isSidebarOpen && (
				<ResizablePanel
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="left"
					className={isExpanded ? "border-l-0" : undefined}
				>
					<RightSidebar />
				</ResizablePanel>
			)}
		</ScrollProvider>
	);
}
