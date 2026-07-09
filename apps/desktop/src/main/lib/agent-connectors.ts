import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	getAgentCodexHome,
	getAgentMemoryDir,
	getAgentWorktreePath,
} from "./agent-home";

/**
 * Per-agent connectors (MCP servers).
 *
 * A connector is an MCP server the agent's runtime CLI can call — Jira,
 * Confluence, Linear, an internal company endpoint, or a local command. The
 * canonical store is `<worktree>/.mcp.json`, the project-scope config Claude
 * Code reads natively, so Claude sessions need zero translation. For Codex
 * agents the same connectors are mirrored into a Roster-managed block of
 * `<agent-home>/.codex/config.toml` (each agent has an isolated CODEX_HOME),
 * regenerated on every add/remove and before each Codex session launch —
 * hand-written config outside the managed block is preserved.
 *
 * Authentication is the CLI's own business (OAuth via /mcp in-session, or
 * headers/env in a custom connector); Roster stores no credentials.
 */

/** One MCP server entry, in .mcp.json shape. */
export interface ConnectorConfig {
	/** Transport. Remote servers are http or sse; local processes are stdio. */
	type: "http" | "sse" | "stdio";
	/** Remote server URL (http/sse). */
	url?: string;
	/** Local command to spawn (stdio). */
	command?: string;
	/** Arguments for the local command (stdio). */
	args?: string[];
	/** Extra HTTP headers (http/sse) — e.g. a static bearer token. */
	headers?: Record<string, string>;
	/** Environment for the local command (stdio). */
	env?: Record<string, string>;
}

export interface ConnectorEntry extends ConnectorConfig {
	name: string;
}

const CONNECTORS_FILE = ".mcp.json";

/** Connector names must be safe as JSON keys, TOML keys, and CLI labels. */
export function isValidConnectorName(name: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name);
}

/**
 * Where this agent's .mcp.json lives. Roster agents derive their worktree from
 * the agent id, but legacy/branch workspaces live elsewhere — callers that
 * know the real workspace path (tRPC resolves it from the DB) pass it in.
 */
function connectorsPath(agentId: string, worktreePath?: string): string {
	return join(
		worktreePath?.trim() || getAgentWorktreePath(agentId),
		CONNECTORS_FILE,
	);
}

/**
 * Read the raw .mcp.json, tolerating a missing file. A corrupt file throws —
 * callers surface that instead of silently clobbering user edits.
 */
function readMcpJson(
	agentId: string,
	worktreePath?: string,
): Record<string, unknown> {
	const path = connectorsPath(agentId, worktreePath);
	if (!existsSync(path)) return {};
	const text = readFileSync(path, "utf8");
	if (!text.trim()) return {};
	const parsed = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${CONNECTORS_FILE} must contain a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

function writeMcpJson(
	agentId: string,
	data: Record<string, unknown>,
	worktreePath?: string,
): void {
	writeFileSync(
		connectorsPath(agentId, worktreePath),
		`${JSON.stringify(data, null, "\t")}\n`,
		"utf8",
	);
}

/** List the agent's connectors from <worktree>/.mcp.json. */
export function listConnectors(
	agentId: string,
	worktreePath?: string,
): ConnectorEntry[] {
	const data = readMcpJson(agentId, worktreePath);
	const servers = data.mcpServers;
	if (typeof servers !== "object" || servers === null) return [];
	const entries: ConnectorEntry[] = [];
	for (const [name, raw] of Object.entries(servers)) {
		if (typeof raw !== "object" || raw === null) continue;
		const cfg = raw as Record<string, unknown>;
		const type =
			cfg.type === "sse" || cfg.type === "stdio"
				? cfg.type
				: cfg.type === "http"
					? "http"
					: // Claude Code treats a missing type as stdio when `command` is
						// set, http otherwise.
						typeof cfg.command === "string"
						? "stdio"
						: "http";
		entries.push({
			name,
			type,
			url: typeof cfg.url === "string" ? cfg.url : undefined,
			command: typeof cfg.command === "string" ? cfg.command : undefined,
			args: Array.isArray(cfg.args)
				? cfg.args.filter((a): a is string => typeof a === "string")
				: undefined,
			headers:
				typeof cfg.headers === "object" && cfg.headers !== null
					? (cfg.headers as Record<string, string>)
					: undefined,
			env:
				typeof cfg.env === "object" && cfg.env !== null
					? (cfg.env as Record<string, string>)
					: undefined,
		});
	}
	return entries;
}

/**
 * Add (or replace) a connector. Preserves everything else in .mcp.json —
 * the file may predate Roster in a cloned repo.
 */
export function addConnector(
	agentId: string,
	entry: ConnectorEntry,
	worktreePath?: string,
	/** One-line "what it's for" recorded in AGENT.md's ## Tools section. */
	note?: string,
): void {
	if (!isValidConnectorName(entry.name)) {
		throw new Error(
			"Connector names use letters, numbers, dashes, and underscores",
		);
	}
	const { name, ...config } = entry;
	const data = readMcpJson(agentId, worktreePath);
	const servers =
		typeof data.mcpServers === "object" && data.mcpServers !== null
			? (data.mcpServers as Record<string, unknown>)
			: {};
	// Strip undefined optionals so the JSON stays clean.
	servers[name] = Object.fromEntries(
		Object.entries(config).filter(([, v]) => v !== undefined),
	);
	data.mcpServers = servers;
	writeMcpJson(agentId, data, worktreePath);
	syncCodexConnectors(agentId, worktreePath);
	recordToolInAgentMd(agentId, name, note);
}

/** Remove a connector by name. No-op if absent. */
export function removeConnector(
	agentId: string,
	name: string,
	worktreePath?: string,
): void {
	const data = readMcpJson(agentId, worktreePath);
	const servers = data.mcpServers;
	if (typeof servers !== "object" || servers === null) return;
	if (!(name in (servers as Record<string, unknown>))) return;
	delete (servers as Record<string, unknown>)[name];
	writeMcpJson(agentId, data, worktreePath);
	syncCodexConnectors(agentId, worktreePath);
}

const TOOLS_HEADING = "## Tools";
const TOOLS_SEED_LINE =
	"- (none yet — connectors added in the Connectors panel appear here)";

/**
 * Record a newly wired tool in the agent's persona (AGENT.md ## Tools) so the
 * agent explicitly knows this connector exists and what its tasks use it for.
 * Guidance, not enforcement: the persona is read every session, which is what
 * steers the model's tool choice. Respectful of user ownership — no Tools
 * heading (user removed it) or an existing entry means no write; the seed
 * placeholder bullet is replaced by the first real entry. Best-effort.
 */
export function recordToolInAgentMd(
	agentId: string,
	name: string,
	note?: string,
): void {
	try {
		const agentMd = join(getAgentMemoryDir(agentId), "AGENT.md");
		if (!existsSync(agentMd)) return;
		const text = readFileSync(agentMd, "utf8");
		const headingIdx = text.indexOf(TOOLS_HEADING);
		if (headingIdx === -1) return;
		if (text.includes(`- **${name}**`)) return;
		const bullet = `- **${name}** connector — ${note?.trim() || "use it when the task touches this system"}`;

		let next: string;
		if (text.includes(TOOLS_SEED_LINE)) {
			next = text.replace(TOOLS_SEED_LINE, bullet);
		} else {
			// Insert at the end of the Tools section (before the next heading).
			const rest = text.slice(headingIdx + TOOLS_HEADING.length);
			const nextHeadingRel = rest.indexOf("\n## ");
			const insertAt =
				nextHeadingRel === -1
					? text.length
					: headingIdx + TOOLS_HEADING.length + nextHeadingRel;
			const before = text.slice(0, insertAt).replace(/\n*$/, "\n");
			next = `${before}${bullet}\n${text.slice(insertAt).replace(/^\n*/, "\n")}`;
		}
		writeFileSync(agentMd, next, "utf8");
	} catch (error) {
		console.warn(
			`[agent-connectors] AGENT.md tools update failed for ${agentId}:`,
			error,
		);
	}
}

const CODEX_BLOCK_START =
	"# >>> roster:connectors (generated — manage in Roster) >>>";
const CODEX_BLOCK_END = "# <<< roster:connectors <<<";

/** Minimal TOML string escaping for the values we write. */
function tomlString(value: string): string {
	return JSON.stringify(value);
}

/**
 * Mirror the agent's connectors into <agent-home>/.codex/config.toml as a
 * Roster-managed block. Codex has no project-scope MCP config, but each agent
 * has its own CODEX_HOME, so per-agent connectors land there. Content outside
 * the managed block (hand edits) is preserved. Best-effort: never throws, so
 * it can sit on the session-launch path.
 */
export function syncCodexConnectors(
	agentId: string,
	worktreePath?: string,
): void {
	try {
		const connectors = listConnectors(agentId, worktreePath);
		const codexHome = getAgentCodexHome(agentId);
		const configPath = join(codexHome, "config.toml");

		const lines: string[] = [CODEX_BLOCK_START];
		for (const c of connectors) {
			lines.push(`[mcp_servers.${c.name}]`);
			if (c.type === "stdio") {
				if (c.command) lines.push(`command = ${tomlString(c.command)}`);
				if (c.args?.length)
					lines.push(`args = [${c.args.map(tomlString).join(", ")}]`);
				if (c.env && Object.keys(c.env).length > 0) {
					const pairs = Object.entries(c.env)
						.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`)
						.join(", ");
					lines.push(`env = { ${pairs} }`);
				}
			} else if (c.url) {
				lines.push(`url = ${tomlString(c.url)}`);
				if (c.headers && Object.keys(c.headers).length > 0) {
					const pairs = Object.entries(c.headers)
						.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`)
						.join(", ");
					lines.push(`http_headers = { ${pairs} }`);
				}
			}
			lines.push("");
		}
		if (lines[lines.length - 1] === "") lines.pop();
		lines.push(CODEX_BLOCK_END);
		const block = lines.join("\n");

		mkdirSync(codexHome, { recursive: true });
		let existing = "";
		if (existsSync(configPath)) {
			existing = readFileSync(configPath, "utf8");
		}
		const startIdx = existing.indexOf(CODEX_BLOCK_START);
		const endIdx = existing.indexOf(CODEX_BLOCK_END);
		let next: string;
		if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
			next =
				existing.slice(0, startIdx) +
				block +
				existing.slice(endIdx + CODEX_BLOCK_END.length);
		} else if (connectors.length === 0) {
			// Nothing to write and no block to replace — leave the file alone.
			return;
		} else {
			next = existing
				? `${existing.replace(/\n*$/, "\n\n")}${block}\n`
				: `${block}\n`;
		}
		writeFileSync(configPath, next, "utf8");
	} catch (error) {
		console.warn(`[agent-connectors] codex sync failed for ${agentId}:`, error);
	}
}
