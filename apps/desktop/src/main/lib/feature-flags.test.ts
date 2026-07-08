import { describe, expect, it } from "bun:test";
import { MEMORY_SCAFFOLD_ENABLED } from "./feature-flags";

// Telemetry-driven remote feature flags were removed with the cloud strip. Flags
// are now compile-time locals read from env with sensible defaults. This locks in
// the default so a regression can't silently turn the memory scaffold off.
describe("feature-flags (local shim)", () => {
	it("defaults MEMORY_SCAFFOLD_ENABLED to true when the env override is unset", () => {
		expect(process.env.ADE_MEMORY_SCAFFOLD).not.toBe("false");
		expect(MEMORY_SCAFFOLD_ENABLED).toBe(true);
	});
});
