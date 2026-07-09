import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { computePaneZoomToggle } from "./utils";

const mosaic: MosaicNode<string> = {
	direction: "row",
	first: "pane-1",
	second: {
		direction: "column",
		first: "pane-2",
		second: "pane-3",
		splitPercentage: 50,
	},
	splitPercentage: 50,
};

describe("computePaneZoomToggle", () => {
	it("zooms in: swaps the layout for a single-pane leaf and stashes the mosaic", () => {
		const update = computePaneZoomToggle(
			{ layout: mosaic },
			"pane-2",
			new Set(["pane-1", "pane-2", "pane-3"]),
		);

		expect(update).toEqual({
			layout: "pane-2",
			zoomedPaneId: "pane-2",
			preZoomLayout: mosaic,
			focusPaneId: "pane-2",
		});
	});

	it("returns null when the tab has a single pane (nothing to zoom)", () => {
		const update = computePaneZoomToggle(
			{ layout: "pane-1" },
			"pane-1",
			new Set(["pane-1"]),
		);
		expect(update).toBeNull();
	});

	it("returns null for a pane that is not in the tab", () => {
		expect(
			computePaneZoomToggle(
				{ layout: mosaic },
				"pane-9",
				new Set(["pane-1", "pane-2", "pane-3"]),
			),
		).toBeNull();
		expect(
			computePaneZoomToggle(
				{ layout: mosaic },
				undefined,
				new Set(["pane-1", "pane-2", "pane-3"]),
			),
		).toBeNull();
	});

	it("returns null for a pane in the pane record but missing from the layout", () => {
		expect(
			computePaneZoomToggle(
				{ layout: mosaic },
				"pane-4",
				new Set(["pane-1", "pane-2", "pane-3", "pane-4"]),
			),
		).toBeNull();
	});

	it("zooms out: restores the stashed mosaic and refocuses the zoomed pane", () => {
		const update = computePaneZoomToggle(
			{
				layout: "pane-2",
				zoomedPaneId: "pane-2",
				preZoomLayout: mosaic,
			},
			"pane-2",
			new Set(["pane-1", "pane-2", "pane-3"]),
		);

		expect(update).toEqual({
			layout: mosaic,
			zoomedPaneId: undefined,
			preZoomLayout: undefined,
			focusPaneId: "pane-2",
		});
	});

	it("zooms out even when called with a different pane id (toggle is tab-level)", () => {
		const update = computePaneZoomToggle(
			{
				layout: "pane-2",
				zoomedPaneId: "pane-2",
				preZoomLayout: mosaic,
			},
			"pane-1",
			new Set(["pane-1", "pane-2", "pane-3"]),
		);

		expect(update?.layout).toEqual(mosaic);
		expect(update?.zoomedPaneId).toBeUndefined();
	});

	it("cleans panes that vanished while zoomed out of the restored layout", () => {
		const update = computePaneZoomToggle(
			{
				layout: "pane-2",
				zoomedPaneId: "pane-2",
				preZoomLayout: mosaic,
			},
			"pane-2",
			new Set(["pane-1", "pane-2"]),
		);

		expect(update?.layout).toEqual({
			direction: "row",
			first: "pane-1",
			second: "pane-2",
			splitPercentage: 50,
		});
		expect(update?.focusPaneId).toBe("pane-2");
	});

	it("falls back to the first restored pane when the zoomed pane is gone", () => {
		const update = computePaneZoomToggle(
			{
				layout: "pane-2",
				zoomedPaneId: "pane-2",
				preZoomLayout: mosaic,
			},
			"pane-2",
			new Set(["pane-1", "pane-3"]),
		);

		expect(update?.layout).toEqual({
			direction: "row",
			first: "pane-1",
			second: "pane-3",
			splitPercentage: 50,
		});
		expect(update?.focusPaneId).toBe("pane-1");
	});

	it("keeps the current layout when the stashed layout has no valid panes", () => {
		const update = computePaneZoomToggle(
			{
				layout: "pane-2",
				zoomedPaneId: "pane-2",
				preZoomLayout: mosaic,
			},
			"pane-2",
			new Set(["pane-2"]),
		);

		// Only the zoomed pane survives — cleanLayout(mosaic) collapses to it.
		expect(update?.layout).toBe("pane-2");
		expect(update?.zoomedPaneId).toBeUndefined();
		expect(update?.focusPaneId).toBe("pane-2");
	});
});
