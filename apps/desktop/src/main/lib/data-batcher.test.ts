import { describe, expect, it } from "bun:test";
import { DataBatcher } from "./data-batcher";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("DataBatcher", () => {
	it("flushes the first write after idle on the next tick (leading edge)", async () => {
		const flushes: string[] = [];
		const batcher = new DataBatcher((data) => flushes.push(data));

		batcher.write("a");
		// Well under the 16ms batch window — a trailing-edge-only batcher
		// would still be holding the data here.
		await sleep(5);
		expect(flushes).toEqual(["a"]);
	});

	it("coalesces writes that follow a recent flush", async () => {
		const flushes: string[] = [];
		const batcher = new DataBatcher((data) => flushes.push(data));

		batcher.write("a");
		await sleep(5);
		expect(flushes).toEqual(["a"]);

		// Inside the batch window now: these should coalesce into one flush.
		batcher.write("b");
		batcher.write("c");
		expect(flushes).toEqual(["a"]);

		await sleep(30);
		expect(flushes).toEqual(["a", "bc"]);
	});

	it("flushes immediately when the buffer exceeds the max batch size", () => {
		const flushes: string[] = [];
		const batcher = new DataBatcher((data) => flushes.push(data));

		const big = "x".repeat(200 * 1024);
		batcher.write(big);
		expect(flushes).toEqual([big]);
	});

	it("dispose flushes pending data", async () => {
		const flushes: string[] = [];
		const batcher = new DataBatcher((data) => flushes.push(data));

		batcher.write("a");
		await sleep(5);
		batcher.write("pending");
		batcher.dispose();
		expect(flushes).toEqual(["a", "pending"]);
	});
});
