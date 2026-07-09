import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Per-agent connector (.mcp.json + Codex mirror) behavior. Uses a throwaway
 * ADE_HOME_DIR (set before any import that reads ROSTER_HOME_DIR at load) so
 * the user's live ~/.roster is never touched.
 */

const TEST_HOME = join(
	tmpdir(),
	`roster-connectors-test-${process.pid}-${Date.now()}`,
);
process.env.ADE_HOME_DIR = TEST_HOME;

let getAgentWorktreePath: (id: string) => string;
let getAgentCodexHome: (id: string) => string;
let connectors: typeof import("./agent-connectors");

beforeAll(async () => {
	const home = await import("./agent-home");
	getAgentWorktreePath = home.getAgentWorktreePath;
	getAgentCodexHome = home.getAgentCodexHome;
	connectors = await import("./agent-connectors");
	expect(getAgentWorktreePath("x").startsWith(TEST_HOME)).toBe(true);
});

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
});

function makeWorktree(agentId: string) {
	mkdirSync(getAgentWorktreePath(agentId), { recursive: true });
}

describe("connector name validation", () => {
	it("accepts simple names and rejects unsafe ones", () => {
		expect(connectors.isValidConnectorName("linear")).toBe(true);
		expect(connectors.isValidConnectorName("my_company-jira2")).toBe(true);
		expect(connectors.isValidConnectorName("")).toBe(false);
		expect(connectors.isValidConnectorName("1starts-with-digit")).toBe(false);
		expect(connectors.isValidConnectorName("has space")).toBe(false);
		expect(connectors.isValidConnectorName("dot.dot")).toBe(false);
		expect(connectors.isValidConnectorName("a".repeat(65))).toBe(false);
	});
});

describe("list/add/remove connectors", () => {
	const AGENT = "conn-agent-1";

	it("lists empty when no .mcp.json exists", () => {
		makeWorktree(AGENT);
		expect(connectors.listConnectors(AGENT)).toEqual([]);
	});

	it("adds a remote connector and reads it back", () => {
		connectors.addConnector(AGENT, {
			name: "linear",
			type: "http",
			url: "https://mcp.linear.app/mcp",
		});
		const listed = connectors.listConnectors(AGENT);
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			name: "linear",
			type: "http",
			url: "https://mcp.linear.app/mcp",
		});
		// On-disk shape is Claude Code's native project config.
		const raw = JSON.parse(
			readFileSync(join(getAgentWorktreePath(AGENT), ".mcp.json"), "utf8"),
		);
		expect(raw.mcpServers.linear).toEqual({
			type: "http",
			url: "https://mcp.linear.app/mcp",
		});
	});

	it("adds a stdio connector with args and env", () => {
		connectors.addConnector(AGENT, {
			name: "local_tool",
			type: "stdio",
			command: "uvx",
			args: ["some-mcp"],
			env: { FOO: "bar" },
		});
		const entry = connectors
			.listConnectors(AGENT)
			.find((c) => c.name === "local_tool");
		expect(entry).toMatchObject({
			type: "stdio",
			command: "uvx",
			args: ["some-mcp"],
			env: { FOO: "bar" },
		});
	});

	it("preserves unrelated keys already present in .mcp.json", () => {
		const path = join(getAgentWorktreePath(AGENT), ".mcp.json");
		const raw = JSON.parse(readFileSync(path, "utf8"));
		raw.someOtherKey = { keep: true };
		writeFileSync(path, JSON.stringify(raw));
		connectors.addConnector(AGENT, {
			name: "sentry",
			type: "http",
			url: "https://mcp.sentry.dev/mcp",
		});
		const after = JSON.parse(readFileSync(path, "utf8"));
		expect(after.someOtherKey).toEqual({ keep: true });
		expect(Object.keys(after.mcpServers).sort()).toEqual([
			"linear",
			"local_tool",
			"sentry",
		]);
	});

	it("removes a connector and no-ops on a missing name", () => {
		connectors.removeConnector(AGENT, "sentry");
		connectors.removeConnector(AGENT, "never-existed");
		expect(connectors.listConnectors(AGENT).map((c) => c.name)).toEqual([
			"linear",
			"local_tool",
		]);
	});

	it("rejects invalid names on add", () => {
		expect(() =>
			connectors.addConnector(AGENT, {
				name: "bad name!",
				type: "http",
				url: "https://x.example",
			}),
		).toThrow();
	});

	it("throws (not clobbers) on a corrupt .mcp.json", () => {
		const path = join(getAgentWorktreePath(AGENT), ".mcp.json");
		const good = readFileSync(path, "utf8");
		writeFileSync(path, "{not json");
		expect(() => connectors.listConnectors(AGENT)).toThrow();
		expect(() =>
			connectors.addConnector(AGENT, {
				name: "x",
				type: "http",
				url: "https://x.example",
			}),
		).toThrow();
		expect(readFileSync(path, "utf8")).toBe("{not json");
		writeFileSync(path, good);
	});

	it("infers type for entries written by hand without one", () => {
		const path = join(getAgentWorktreePath(AGENT), ".mcp.json");
		const raw = JSON.parse(readFileSync(path, "utf8"));
		raw.mcpServers.handmade_remote = { url: "https://internal.corp/mcp" };
		raw.mcpServers.handmade_local = { command: "./run.sh" };
		writeFileSync(path, JSON.stringify(raw));
		const byName = new Map(
			connectors.listConnectors(AGENT).map((c) => [c.name, c]),
		);
		expect(byName.get("handmade_remote")?.type).toBe("http");
		expect(byName.get("handmade_local")?.type).toBe("stdio");
	});

	it("honors an explicit worktreePath (legacy/branch workspaces)", () => {
		const externalDir = join(TEST_HOME, "external-repo");
		mkdirSync(externalDir, { recursive: true });
		connectors.addConnector(
			"legacy-agent",
			{ name: "linear", type: "http", url: "https://mcp.linear.app/mcp" },
			externalDir,
		);
		const raw = JSON.parse(
			readFileSync(join(externalDir, ".mcp.json"), "utf8"),
		);
		expect(raw.mcpServers.linear.url).toBe("https://mcp.linear.app/mcp");
		expect(
			connectors.listConnectors("legacy-agent", externalDir),
		).toHaveLength(1);
		// Nothing landed at the derived path.
		expect(connectors.listConnectors("legacy-agent")).toEqual([]);
	});
});

describe("codex config.toml mirror", () => {
	const AGENT = "conn-agent-codex";

	it("writes a managed block with remote and stdio servers", () => {
		makeWorktree(AGENT);
		connectors.addConnector(AGENT, {
			name: "atlassian",
			type: "sse",
			url: "https://mcp.atlassian.com/v1/sse",
		});
		connectors.addConnector(AGENT, {
			name: "local_tool",
			type: "stdio",
			command: "uvx",
			args: ["some-mcp"],
		});
		const toml = readFileSync(
			join(getAgentCodexHome(AGENT), "config.toml"),
			"utf8",
		);
		expect(toml).toContain("# >>> roster:connectors");
		expect(toml).toContain("[mcp_servers.atlassian]");
		expect(toml).toContain('url = "https://mcp.atlassian.com/v1/sse"');
		expect(toml).toContain("[mcp_servers.local_tool]");
		expect(toml).toContain('command = "uvx"');
		expect(toml).toContain('args = ["some-mcp"]');
		expect(toml).toContain("# <<< roster:connectors <<<");
	});

	it("preserves hand-written config outside the managed block", () => {
		const configPath = join(getAgentCodexHome(AGENT), "config.toml");
		const existing = readFileSync(configPath, "utf8");
		writeFileSync(configPath, `model = "gpt-5.5"\n\n${existing}`);
		connectors.removeConnector(AGENT, "local_tool");
		const after = readFileSync(configPath, "utf8");
		expect(after.startsWith('model = "gpt-5.5"')).toBe(true);
		expect(after).toContain("[mcp_servers.atlassian]");
		expect(after).not.toContain("[mcp_servers.local_tool]");
		// Exactly one managed block.
		expect(after.split("# >>> roster:connectors").length).toBe(2);
	});

	it("does not create config.toml for an agent with no connectors", () => {
		const OTHER = "conn-agent-empty";
		makeWorktree(OTHER);
		connectors.syncCodexConnectors(OTHER);
		expect(() =>
			readFileSync(join(getAgentCodexHome(OTHER), "config.toml"), "utf8"),
		).toThrow();
	});
});
