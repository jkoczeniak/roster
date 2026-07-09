import { Maximize2, RadioTower } from "lucide-react";
import { useContext, useRef } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow, MosaicWindowContext } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitOrientation } from "../../hooks";
import { useSplitOrientation } from "../../hooks";

/**
 * Floating chips (top-right of the pane content) for armed pane modes:
 * broadcast input (shown on every terminal pane in the tab) and zoom
 * (shown on the maximized pane).
 */
function PaneModeIndicators({
	paneId,
	tabId,
}: {
	paneId: string;
	tabId: string;
}) {
	const isBroadcasting = useTabsStore(
		(s) =>
			Boolean(s.broadcastTabIds[tabId]) &&
			s.panes[paneId]?.type === "terminal",
	);
	const isZoomed = useTabsStore(
		(s) => s.tabs.find((t) => t.id === tabId)?.zoomedPaneId === paneId,
	);

	if (!isBroadcasting && !isZoomed) return null;

	return (
		<div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1.5">
			{isZoomed && (
				<span className="flex items-center gap-1 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
					<Maximize2 className="h-3 w-3" />
					Zoomed
				</span>
			)}
			{isBroadcasting && (
				<span className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 backdrop-blur-sm">
					<RadioTower className="h-3 w-3" />
					Broadcast
				</span>
			)}
		</div>
	);
}

export interface PaneHandlers {
	onFocus: () => void;
	onClosePane: (e: React.MouseEvent) => void;
	onSplitPane: (e: React.MouseEvent) => void;
	splitOrientation: SplitOrientation;
}

/**
 * Connects drag source for root panes (single pane in a tab).
 * react-mosaic-component skips drag connection for root panes (path=[]),
 * but we need it for cross-tab drag-and-drop.
 */
function RootDraggable({ children }: { children: React.ReactNode }) {
	const { mosaicWindowActions } = useContext(MosaicWindowContext);
	return mosaicWindowActions.connectDragSource(
		<div className="h-full w-full">{children}</div>,
	);
}

interface BasePaneWindowProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	renderToolbar: (handlers: PaneHandlers) => React.ReactElement;
	children: React.ReactNode;
	contentClassName?: string;
}

export function BasePaneWindow({
	paneId,
	path,
	tabId,
	splitPaneAuto,
	removePane,
	setFocusedPane,
	renderToolbar,
	children,
	contentClassName = "w-full h-full overflow-hidden",
}: BasePaneWindowProps) {
	const isActive = useTabsStore((s) => s.focusedPaneIds[tabId] === paneId);
	const containerRef = useRef<HTMLDivElement>(null);
	const splitOrientation = useSplitOrientation(containerRef);
	const isDragging = useDragPaneStore((s) => s.draggingPaneId !== null);
	const setDragging = useDragPaneStore((s) => s.setDragging);
	const clearDragging = useDragPaneStore((s) => s.clearDragging);

	const handleFocus = () => {
		setFocusedPane(tabId, paneId);
	};

	const handleClosePane = (e: React.MouseEvent) => {
		e.stopPropagation();
		removePane(paneId);
	};

	const handleSplitPane = (e: React.MouseEvent) => {
		e.stopPropagation();
		const container = containerRef.current;
		if (!container) return;

		const { width, height } = container.getBoundingClientRect();
		splitPaneAuto(tabId, paneId, { width, height }, path);
	};

	const handlers: PaneHandlers = {
		onFocus: handleFocus,
		onClosePane: handleClosePane,
		onSplitPane: handleSplitPane,
		splitOrientation,
	};

	const isRoot = path.length === 0;

	return (
		<MosaicWindow<string>
			path={path}
			title=""
			renderToolbar={() =>
				isRoot ? (
					<RootDraggable>{renderToolbar(handlers)}</RootDraggable>
				) : (
					renderToolbar(handlers)
				)
			}
			className={isActive ? "mosaic-window-focused" : ""}
			onDragStart={() => setDragging(paneId, tabId)}
			onDragEnd={() => clearDragging()}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Focus handler for pane */}
			<div
				ref={containerRef}
				className={`relative ${contentClassName}`}
				style={isDragging ? { pointerEvents: "none" } : undefined}
				onClick={handleFocus}
			>
				<PaneModeIndicators paneId={paneId} tabId={tabId} />
				{children}
			</div>
		</MosaicWindow>
	);
}
