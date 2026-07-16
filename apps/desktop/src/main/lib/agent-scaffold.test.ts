import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaces, worktrees } from "@roster/local-db";

/**
 * End-to-end memory-scaffold verification (docs/memory.md).
 *
 * Exercises setupAgentRepo + scaffoldAgentMemory + regenerateCodexAgentsMd
 * against a throwaway ADE_HOME_DIR so the user's live ~/.roster-default is never
 * touched. The env var is set BEFORE importing any module that reads
 * ROSTER_HOME_DIR at load, so all path helpers resolve under TEST_HOME.
 */

const TEST_HOME = join(
	tmpdir(),
	`roster-scaffold-test-${process.pid}-${Date.now()}`,
);
process.env.ADE_HOME_DIR = TEST_HOME;

// Deferred (dynamic) imports so the env override above wins over module load.
let getAgentHome: (id: string) => string;
let getAgentMemoryDir: (id: string) => string;
let getAgentWorktreePath: (id: string) => string;
let getAgentCodexHome: (id: string) => string;
let getSharedUserProfilePath: () => string;
let setupAgentRepo: typeof import("./agent-repo").setupAgentRepo;
let scaffoldAgentMemory: typeof import("./agent-scaffold").scaffoldAgentMemory;
let regenerateCodexAgentsMd: typeof import("./agent-scaffold").regenerateCodexAgentsMd;
let ensureClaudeSkillsLink: typeof import("./agent-scaffold").ensureClaudeSkillsLink;

beforeAll(async () => {
	const home = await import("./agent-home");
	getAgentHome = home.getAgentHome;
	getAgentMemoryDir = home.getAgentMemoryDir;
	getAgentWorktreePath = home.getAgentWorktreePath;
	getAgentCodexHome = home.getAgentCodexHome;
	getSharedUserProfilePath = home.getSharedUserProfilePath;
	const repo = await import("./agent-repo");
	setupAgentRepo = repo.setupAgentRepo;
	const scaffold = await import("./agent-scaffold");
	scaffoldAgentMemory = scaffold.scaffoldAgentMemory;
	regenerateCodexAgentsMd = scaffold.regenerateCodexAgentsMd;
	ensureClaudeSkillsLink = scaffold.ensureClaudeSkillsLink;

	// Sanity: the env override must actually route paths under TEST_HOME.
	expect(getAgentHome("x").startsWith(TEST_HOME)).toBe(true);
});

afterAll(() => {
	rmSync(TEST_HOME, { recursive: true, force: true });
});

async function makeAgent(agentId: string, runtime: "claude" | "codex") {
	await setupAgentRepo({ agentId, source: { type: "init" } });
	scaffoldAgentMemory({
		agentId,
		agentName: "Testy",
		runtime,
		userName: "Pat",
	});
}

describe("scaffoldAgentMemory — canonical layout", () => {
	const agentId = "agent-claude";
	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("writes the canonical memory/ files (AGENT/MEMORY + protocol)", () => {
		const mem = getAgentMemoryDir(agentId);
		for (const f of ["AGENT.md", "MEMORY.md", ".writeback-protocol.md"]) {
			expect(existsSync(join(mem, f))).toBe(true);
		}
	});

	it("seeds USER.md at the SHARED path, not per-agent", () => {
		const shared = getSharedUserProfilePath();
		expect(shared.startsWith(TEST_HOME)).toBe(true);
		expect(shared.startsWith(getAgentHome(agentId))).toBe(false);
		expect(existsSync(shared)).toBe(true);
		const userMd = readFileSync(shared, "utf8");
		expect(userMd).toContain("SHARED across ALL");
		// Per-agent memory/USER.md is no longer scaffolded.
		expect(existsSync(join(getAgentMemoryDir(agentId), "USER.md"))).toBe(false);
	});

	it("substitutes template variables (no literal {{...}} left)", () => {
		const mem = getAgentMemoryDir(agentId);
		const agentMd = readFileSync(join(mem, "AGENT.md"), "utf8");
		expect(agentMd).toContain("Testy");
		expect(agentMd).not.toMatch(/\{\{\w+\}\}/);
		const userMd = readFileSync(getSharedUserProfilePath(), "utf8");
		expect(userMd).toContain("Pat");
		expect(userMd).not.toMatch(/\{\{\w+\}\}/);
		const proto = readFileSync(join(mem, ".writeback-protocol.md"), "utf8");
		expect(proto).not.toMatch(/\{\{\w+\}\}/);
	});

	it("seeds the skills/ dir with a README and a SKILL template", () => {
		const skills = join(getAgentHome(agentId), "skills");
		expect(existsSync(join(skills, "README.md"))).toBe(true);
		expect(existsSync(join(skills, "SKILL.template.md"))).toBe(true);
	});

	it("SKILL template carries the Hermes frontmatter + section order", () => {
		const tpl = readFileSync(
			join(getAgentHome(agentId), "skills", "SKILL.template.md"),
			"utf8",
		);
		// agentskills.io-compatible frontmatter keys.
		expect(tpl).toContain("name:");
		expect(tpl).toContain("description:");
		expect(tpl).toContain("version:");
		expect(tpl).toContain("metadata:");
		expect(tpl).toContain("<= 60 chars");
		// Canonical body section order from Hermes' authoring standards.
		for (const section of [
			"## When to Use",
			"## Prerequisites",
			"## Procedure",
			"## Pitfalls",
			"## Verification",
		]) {
			expect(tpl).toContain(section);
		}
	});

	it("write-back protocol ports the Hermes self-curation guidance + budgets", () => {
		const proto = readFileSync(
			join(getAgentMemoryDir(agentId), ".writeback-protocol.md"),
			"utf8",
		);
		// Ported phrasings / structure from the Hermes memory-tool description.
		expect(proto).toContain("WHEN to save");
		expect(proto).toContain("SKIP");
		expect(proto).toContain("WHEN FULL");
		expect(proto).toContain("Consolidate");
		expect(proto).toContain("stops");
		// Hermes char budgets as soft guidance.
		expect(proto).toContain("1,375");
		expect(proto).toContain("2,200");
		// The ported self-improvement loop.
		expect(proto).toContain("Session-end reflection");
	});

	it("write-back protocol points at the SHARED USER.md and says it is shared", () => {
		const proto = readFileSync(
			join(getAgentMemoryDir(agentId), ".writeback-protocol.md"),
			"utf8",
		);
		expect(proto).toContain(getSharedUserProfilePath());
		expect(proto).toContain("SHARED across ALL");
		// The old per-agent USER.md path must be gone from the protocol.
		expect(proto).not.toContain(join(getAgentMemoryDir(agentId), "USER.md"));
	});

	it("AGENT.md invites the agent to build its role when none is given", () => {
		const agentMd = readFileSync(
			join(getAgentMemoryDir(agentId), "AGENT.md"),
			"utf8",
		);
		expect(agentMd).toContain("## Role");
		expect(agentMd).toContain("Not set yet");
	});

	it("keeps memory/ OUTSIDE the worktree", () => {
		const worktree = getAgentWorktreePath(agentId);
		expect(getAgentMemoryDir(agentId).startsWith(worktree)).toBe(false);
	});
});

describe("optional role seeds the AGENT.md persona", () => {
	const agentId = "agent-role";
	beforeAll(async () => {
		await setupAgentRepo({ agentId, source: { type: "init" } });
		scaffoldAgentMemory({
			agentId,
			agentName: "Roley",
			runtime: "claude",
			userName: "Pat",
			role: "Owns the billing service; ships and reviews Stripe integrations.",
		});
	});

	it("writes the provided role into AGENT.md's Role section", () => {
		const agentMd = readFileSync(
			join(getAgentMemoryDir(agentId), "AGENT.md"),
			"utf8",
		);
		expect(agentMd).toContain("## Role");
		expect(agentMd).toContain("Owns the billing service");
		expect(agentMd).not.toContain("Not set yet");
		expect(agentMd).not.toMatch(/\{\{\w+\}\}/);
	});
});

describe("vcs-aware prompt copy (Folder vs git agents)", () => {
	const gitAgentId = "agent-vcs-git";
	const folderAgentId = "agent-vcs-folder";
	beforeAll(async () => {
		await setupAgentRepo({ agentId: gitAgentId, source: { type: "init" } });
		scaffoldAgentMemory({
			agentId: gitAgentId,
			agentName: "Gitty",
			runtime: "claude",
			userName: "Pat",
			vcs: "git",
		});
		await setupAgentRepo({
			agentId: folderAgentId,
			source: { type: "folder" },
		});
		scaffoldAgentMemory({
			agentId: folderAgentId,
			agentName: "Foldy",
			runtime: "claude",
			userName: "Pat",
			vcs: "none",
		});
	});

	it("git agents keep the worktree identity", () => {
		const agentMd = readFileSync(
			join(getAgentMemoryDir(gitAgentId), "AGENT.md"),
			"utf8",
		);
		expect(agentMd).toContain("a dedicated git worktree");
		expect(agentMd).not.toContain("NOT a git repository");
	});

	it("folder agents get a prompt with no git vocabulary", () => {
		const agentMd = readFileSync(
			join(getAgentMemoryDir(folderAgentId), "AGENT.md"),
			"utf8",
		);
		expect(agentMd).toContain("a dedicated folder");
		expect(agentMd).toContain("NOT a git repository");
		expect(agentMd).not.toContain("git worktree");
		expect(agentMd).not.toMatch(/\{\{\w+\}\}/);
	});

	it("legacy callers (no vcs param) default to the git copy", () => {
		const agentMd = readFileSync(
			join(getAgentMemoryDir("agent-claude"), "AGENT.md"),
			"utf8",
		);
		expect(agentMd).toContain("a dedicated git worktree");
	});
});

describe("Claude Code session-reflection hook (Hermes learning-loop analog)", () => {
	const agentId = "agent-reflect";
	beforeAll(async () => {
		await setupAgentRepo({ agentId, source: { type: "init" } });
		scaffoldAgentMemory({
			agentId,
			agentName: "Reflecty",
			runtime: "claude",
			userName: "Pat",
		});
	});

	it("wires a Stop hook that runs the reflection script", () => {
		const wt = getAgentWorktreePath(agentId);
		const settings = JSON.parse(
			readFileSync(join(wt, ".claude", "settings.json"), "utf8"),
		);
		const stop = settings.hooks?.Stop;
		expect(Array.isArray(stop)).toBe(true);
		const cmd = stop[0].hooks[0].command as string;
		expect(cmd).toContain("reflect-on-stop.mjs");
		expect(stop[0].hooks[0].type).toBe("command");
	});

	it("hook script guards against an infinite stop loop and blocks otherwise", () => {
		const wt = getAgentWorktreePath(agentId);
		const script = readFileSync(
			join(wt, ".claude", "reflect-on-stop.mjs"),
			"utf8",
		);
		// The loop guard (Claude Code sets stop_hook_active on the injected turn).
		expect(script).toContain("stop_hook_active");
		// The self-continuation contract: decision:block feeds `reason` to the model.
		expect(script).toContain('"block"');
		expect(script).toContain("reason");
	});

	it("hook script skips trivial sessions via transcript_path size (< 16 KB)", () => {
		const script = readFileSync(
			join(getAgentWorktreePath(agentId), ".claude", "reflect-on-stop.mjs"),
			"utf8",
		);
		expect(script).toContain("transcript_path");
		expect(script).toContain("16 * 1024");
	});

	it("hook script takes/releases a .reflect.lock in the agent's memory dir", () => {
		const script = readFileSync(
			join(getAgentWorktreePath(agentId), ".claude", "reflect-on-stop.mjs"),
			"utf8",
		);
		expect(script).toContain(join(getAgentMemoryDir(agentId), ".reflect.lock"));
		expect(script).toContain("10 * 60 * 1000");
		// Lock released on the post-reflection (stop_hook_active) call.
		expect(script).toContain("unlinkSync(LOCK_PATH)");
	});

	it("re-scaffold refreshes the hook script (machine-owned, not frozen at creation)", async () => {
		const hookPath = join(
			getAgentWorktreePath(agentId),
			".claude",
			"reflect-on-stop.mjs",
		);
		const { writeFileSync } = await import("node:fs");
		writeFileSync(hookPath, "// stale generated hook\n", "utf8");
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		const refreshed = readFileSync(hookPath, "utf8");
		expect(refreshed).toContain("stop_hook_active");
		expect(refreshed).not.toContain("stale generated hook");
	});

	it("hook script stats MEMORY.md and the SHARED USER.md against their budgets", () => {
		const script = readFileSync(
			join(getAgentWorktreePath(agentId), ".claude", "reflect-on-stop.mjs"),
			"utf8",
		);
		expect(script).toContain("statSync");
		expect(script).toContain(join(getAgentMemoryDir(agentId), "MEMORY.md"));
		expect(script).toContain("2200");
		expect(script).toContain(getSharedUserProfilePath());
		expect(script).toContain("1375");
		expect(script).toContain("over its size budget");
	});
});

describe("Claude Code bridge", () => {
	const agentId = "agent-claude2";
	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("CLAUDE.md @imports AGENT.md, USER.md, and the protocol via in-worktree links", () => {
		const wt = getAgentWorktreePath(agentId);
		const claudeMd = readFileSync(join(wt, "CLAUDE.md"), "utf8");
		// Imports are relative, resolving through .claude/ symlinks, so nothing
		// is "external" to the project (avoids the external-imports dialog).
		expect(claudeMd).toContain("@.claude/memory/AGENT.md");
		expect(claudeMd).toContain("@.claude/USER.md");
		expect(claudeMd).toContain("@.claude/memory/.writeback-protocol.md");
		// No absolute-path (external) imports remain.
		expect(claudeMd).not.toContain(`@${getAgentHome(agentId)}`);
		expect(claudeMd).not.toContain(`@${getSharedUserProfilePath()}`);
		// MEMORY.md must NOT be @imported (native auto-memory owns it).
		expect(claudeMd).not.toContain("memory/MEMORY.md");
	});

	it("creates .claude/memory and .claude/USER.md links resolving to canonical files", async () => {
		const { lstatSync, realpathSync } = await import("node:fs");
		const wt = getAgentWorktreePath(agentId);
		const memLink = join(wt, ".claude", "memory");
		const userLink = join(wt, ".claude", "USER.md");
		expect(lstatSync(memLink).isSymbolicLink()).toBe(true);
		expect(lstatSync(userLink).isSymbolicLink()).toBe(true);
		// The imported files are reachable through the links.
		expect(realpathSync(join(memLink, "AGENT.md"))).toBe(
			realpathSync(join(getAgentMemoryDir(agentId), "AGENT.md")),
		);
		expect(realpathSync(userLink)).toBe(
			realpathSync(getSharedUserProfilePath()),
		);
	});

	it("upgrades an untouched legacy absolute-import bridge in place", async () => {
		const { writeFileSync } = await import("node:fs");
		const wt = getAgentWorktreePath(agentId);
		const bridgePath = join(wt, "CLAUDE.md");
		const legacy = `@${getAgentHome(agentId)}/memory/AGENT.md
@${getSharedUserProfilePath()}
@${getAgentHome(agentId)}/memory/.writeback-protocol.md
<!-- MEMORY.md is loaded via Claude Code native auto-memory (autoMemoryDirectory). -->
`;
		writeFileSync(bridgePath, legacy, "utf8");
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		expect(readFileSync(bridgePath, "utf8")).toContain(
			"@.claude/memory/AGENT.md",
		);
	});

	it("leaves a user-customized bridge alone", async () => {
		const { writeFileSync } = await import("node:fs");
		const wt = getAgentWorktreePath(agentId);
		const bridgePath = join(wt, "CLAUDE.md");
		const custom = "# my own bridge\n@.claude/memory/AGENT.md\n";
		writeFileSync(bridgePath, custom, "utf8");
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		expect(readFileSync(bridgePath, "utf8")).toBe(custom);
	});

	it("points native auto-memory at the canonical dir", () => {
		const wt = getAgentWorktreePath(agentId);
		const settings = JSON.parse(
			readFileSync(join(wt, ".claude", "settings.json"), "utf8"),
		);
		expect(settings.autoMemoryEnabled).toBe(true);
		expect(settings.autoMemoryDirectory).toBe(getAgentMemoryDir(agentId));
	});
});

describe("git-exclude of bridge files", () => {
	const agentId = "agent-exclude";
	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("adds the bridge files to .git/info/exclude", () => {
		const wt = getAgentWorktreePath(agentId);
		const exclude = readFileSync(join(wt, ".git", "info", "exclude"), "utf8");
		for (const pat of ["CLAUDE.md", ".claude/", "AGENTS.md"]) {
			expect(exclude).toContain(pat);
		}
	});
});

describe("Codex bridge regen", () => {
	const agentId = "agent-codex";
	beforeAll(async () => {
		await makeAgent(agentId, "codex");
	});

	it("generates .codex/AGENTS.md at scaffold time for codex runtime", () => {
		expect(existsSync(join(getAgentCodexHome(agentId), "AGENTS.md"))).toBe(
			true,
		);
	});

	it("concatenates AGENT + shared USER + MEMORY + protocol from canonical files", () => {
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		// Distinctive markers from each source file.
		expect(agents).toContain("autonomous coding agent"); // AGENT.md
		expect(agents).toContain("User profile"); // the SHARED USER.md
		expect(agents).toContain("SHARED across ALL"); // shared-profile marker
		expect(agents).toContain("Memory — Testy"); // MEMORY.md
		expect(agents).toContain("Your persistent memory — how to maintain it"); // protocol
		// The protocol's session-end reflection text rides along (Codex has no
		// stop hook — reflection is convention-driven).
		expect(agents).toContain("Session-end reflection");
		expect(Buffer.byteLength(agents, "utf8")).toBeLessThan(32 * 1024);
	});

	it("appends the standing reflect-before-done instruction (Codex parity)", () => {
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		expect(agents).toContain(
			"Before you consider a task complete, run the session-end reflection",
		);
	});

	it("omits the Skills section when the agent has no skills", () => {
		// The scaffold seeds skills/README.md + SKILL.template.md (plain files,
		// not skill dirs), so a fresh agent has no indexable skills.
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		// Exact-header match: the protocol's "## Skills — reusable know-how"
		// section is always present; the generated index header is bare.
		expect(agents).not.toContain("\n## Skills\n");
		expect(agents).not.toContain("before doing this kind of task");
	});

	it("indexes skills (frontmatter name/description) after the memory files", () => {
		const fs = require("node:fs") as typeof import("node:fs");
		const skillDir = join(getAgentHome(agentId), "skills", "deploy-docs");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillPath,
			[
				"---",
				"name: deploy-docs",
				"description: Build and publish the docs site.",
				"version: 0.1.0",
				"---",
				"",
				"# Deploy docs",
				"",
				"Body procedure here.",
				"",
			].join("\n"),
			"utf8",
		);
		regenerateCodexAgentsMd(agentId);
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		expect(agents).toContain("\n## Skills\n");
		expect(agents).toContain(
			`- **deploy-docs** — Build and publish the docs site. (read ${skillPath} before doing this kind of task)`,
		);
	});

	it("tolerates a SKILL.md without frontmatter (dir name + first body line)", () => {
		const fs = require("node:fs") as typeof import("node:fs");
		const skillDir = join(getAgentHome(agentId), "skills", "bare-skill");
		fs.mkdirSync(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		fs.writeFileSync(
			skillPath,
			"# Some heading\n\nRuns the release checklist end to end.\n",
			"utf8",
		);
		regenerateCodexAgentsMd(agentId);
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		expect(agents).toContain(
			`- **bare-skill** — Runs the release checklist end to end. (read ${skillPath} before doing this kind of task)`,
		);
	});

	it("does not clobber an existing bridge when canonical memory is absent", async () => {
		// Fresh agent with a repo but NO scaffold (simulates flag-OFF creation).
		const bareId = "agent-codex-bare";
		await setupAgentRepo({ agentId: bareId, source: { type: "init" } });
		const codexHome = getAgentCodexHome(bareId);
		const fs = require("node:fs");
		fs.mkdirSync(codexHome, { recursive: true });
		const sentinel = "PRE-EXISTING-BRIDGE";
		fs.writeFileSync(join(codexHome, "AGENTS.md"), sentinel, "utf8");
		// Memory dir exists (setupAgentRepo makes it) but has no *.md files.
		regenerateCodexAgentsMd(bareId);
		expect(readFileSync(join(codexHome, "AGENTS.md"), "utf8")).toBe(sentinel);
	});

	it("reflects a mid-session edit to canonical MEMORY.md on the next regen", () => {
		const mem = getAgentMemoryDir(agentId);
		const marker = "LEARNED-FACT-XYZ";
		const memoryPath = join(mem, "MEMORY.md");
		const before = readFileSync(memoryPath, "utf8");
		require("node:fs").writeFileSync(
			memoryPath,
			`${before}\n- ${marker}\n`,
			"utf8",
		);
		regenerateCodexAgentsMd(agentId);
		const agents = readFileSync(
			join(getAgentCodexHome(agentId), "AGENTS.md"),
			"utf8",
		);
		expect(agents).toContain(marker);
	});
});

describe("skills symlink — .claude/skills → <agent-home>/skills", () => {
	const fs = require("node:fs") as typeof import("node:fs");
	const agentId = "agent-skills-link";

	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("scaffold creates the symlink pointing at the canonical skills dir", () => {
		const linkPath = join(getAgentWorktreePath(agentId), ".claude", "skills");
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
		expect(fs.readlinkSync(linkPath)).toBe(
			join(getAgentHome(agentId), "skills"),
		);
		// The link resolves: a skill written through it lands in agent-home.
		fs.writeFileSync(join(linkPath, "via-link.md"), "x", "utf8");
		expect(
			fs.existsSync(join(getAgentHome(agentId), "skills", "via-link.md")),
		).toBe(true);
	});

	it("re-ensuring is a no-op when the link is already correct", () => {
		const linkPath = join(getAgentWorktreePath(agentId), ".claude", "skills");
		ensureClaudeSkillsLink(agentId);
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
		expect(fs.readlinkSync(linkPath)).toBe(
			join(getAgentHome(agentId), "skills"),
		);
	});

	it("replaces a symlink that points somewhere else", () => {
		const linkPath = join(getAgentWorktreePath(agentId), ".claude", "skills");
		const elsewhere = join(TEST_HOME, "elsewhere-skills");
		fs.mkdirSync(elsewhere, { recursive: true });
		fs.unlinkSync(linkPath);
		fs.symlinkSync(elsewhere, linkPath, "dir");
		ensureClaudeSkillsLink(agentId);
		expect(fs.readlinkSync(linkPath)).toBe(
			join(getAgentHome(agentId), "skills"),
		);
	});

	it("does NOT clobber a real .claude/skills directory with content (user-owned)", () => {
		const linkPath = join(getAgentWorktreePath(agentId), ".claude", "skills");
		fs.unlinkSync(linkPath);
		fs.mkdirSync(join(linkPath, "user-skill"), { recursive: true });
		fs.writeFileSync(
			join(linkPath, "user-skill", "SKILL.md"),
			"# user-owned\n",
			"utf8",
		);
		ensureClaudeSkillsLink(agentId);
		// Left as a real directory, content intact.
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(false);
		expect(fs.lstatSync(linkPath).isDirectory()).toBe(true);
		expect(fs.existsSync(join(linkPath, "user-skill", "SKILL.md"))).toBe(true);
		// Restore the link for any later assertions on this agent.
		fs.rmSync(linkPath, { recursive: true, force: true });
		ensureClaudeSkillsLink(agentId);
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
	});

	it("honors an external worktree override", () => {
		const externalWt = join(TEST_HOME, "external-repos", "skills-ext");
		fs.mkdirSync(join(externalWt, ".git", "info"), { recursive: true });
		scaffoldAgentMemory({
			agentId: "agent-skills-ext",
			agentName: "Exty",
			runtime: "claude",
			userName: "Pat",
			worktreePath: externalWt,
		});
		const linkPath = join(externalWt, ".claude", "skills");
		expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
		expect(fs.readlinkSync(linkPath)).toBe(
			join(getAgentHome("agent-skills-ext"), "skills"),
		);
	});
});

describe("writeIfMissing semantics — an emptied file sticks", () => {
	const fs = require("node:fs") as typeof import("node:fs");
	const agentId = "agent-emptied";

	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("does NOT re-seed a canonical file the user deliberately emptied", () => {
		const memoryPath = join(getAgentMemoryDir(agentId), "MEMORY.md");
		fs.writeFileSync(memoryPath, "", "utf8");
		// Re-run the scaffold (what the launch-time backfill invokes).
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		expect(readFileSync(memoryPath, "utf8")).toBe("");
	});

	it("does NOT re-seed an emptied bridge file either", () => {
		const bridgePath = join(getAgentWorktreePath(agentId), "CLAUDE.md");
		fs.writeFileSync(bridgePath, "", "utf8");
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		expect(readFileSync(bridgePath, "utf8")).toBe("");
	});
});

describe("scaffoldAgentMemory — idempotent re-run (backfill safety)", () => {
	const agentId = "agent-rerun";
	const fs = require("node:fs") as typeof import("node:fs");
	const count = (s: string, sub: string) => s.split(sub).length - 1;

	beforeAll(async () => {
		await makeAgent(agentId, "claude");
	});

	it("preserves a hand-edited canonical file and a customized bridge on re-run", () => {
		const mem = getAgentMemoryDir(agentId);
		const wt = getAgentWorktreePath(agentId);
		const editedAgent = "# MY PERSONA\n- custom brief\n";
		const editedBridge = "@custom/AGENT.md\n";
		fs.writeFileSync(join(mem, "AGENT.md"), editedAgent, "utf8");
		fs.writeFileSync(join(wt, "CLAUDE.md"), editedBridge, "utf8");

		// Re-run scaffold (this is exactly what the backfill invokes).
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});

		expect(readFileSync(join(mem, "AGENT.md"), "utf8")).toBe(editedAgent);
		expect(readFileSync(join(wt, "CLAUDE.md"), "utf8")).toBe(editedBridge);
	});

	it("preserves a hand-edited SHARED USER.md on re-run (first scaffold wins)", () => {
		const shared = getSharedUserProfilePath();
		const before = readFileSync(shared, "utf8");
		const edited = `${before}- learned: prefers tabs\n`;
		fs.writeFileSync(shared, edited, "utf8");
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "SomeoneElse",
		});
		expect(readFileSync(shared, "utf8")).toBe(edited);
	});

	it("does not duplicate the .git/info/exclude block across re-runs", () => {
		const excludePath = join(
			getAgentWorktreePath(agentId),
			".git",
			"info",
			"exclude",
		);
		scaffoldAgentMemory({
			agentId,
			agentName: "Testy",
			runtime: "claude",
			userName: "Pat",
		});
		const exclude = readFileSync(excludePath, "utf8");
		expect(count(exclude, "# Roster agent bridge files")).toBe(1);
	});
});

describe("external worktree (local-path agents) — bridges honor the override", () => {
	const fs = require("node:fs") as typeof import("node:fs");
	const agentId = "agent-external";
	// An external repo dir, standing in for a local-path agent's real worktree
	// (stored on its worktrees row, NOT under <agent-home>/worktree).
	const externalWt = join(TEST_HOME, "external-repos", agentId);

	beforeAll(() => {
		fs.mkdirSync(join(externalWt, ".git", "info"), { recursive: true });
		scaffoldAgentMemory({
			agentId,
			agentName: "Exty",
			runtime: "claude",
			userName: "Pat",
			worktreePath: externalWt,
		});
	});

	it("writes bridge files into the EXTERNAL worktree, not the derived one", () => {
		expect(fs.existsSync(join(externalWt, "CLAUDE.md"))).toBe(true);
		expect(fs.existsSync(join(externalWt, ".claude", "settings.json"))).toBe(
			true,
		);
		// The derived worktree dir must not have been created/populated.
		expect(
			fs.existsSync(join(getAgentWorktreePath(agentId), "CLAUDE.md")),
		).toBe(false);
	});

	it("git-excludes the bridges in the external repo", () => {
		const exclude = readFileSync(
			join(externalWt, ".git", "info", "exclude"),
			"utf8",
		);
		expect(exclude).toContain("# Roster agent bridge files");
	});

	it("keeps canonical memory under <agent-home>, not the external worktree", () => {
		expect(fs.existsSync(join(getAgentMemoryDir(agentId), "AGENT.md"))).toBe(
			true,
		);
		expect(fs.existsSync(join(externalWt, "memory", "AGENT.md"))).toBe(false);
	});
});

describe("backfillAgentMemory — one-time migration of pre-flip agents", () => {
	const fs = require("node:fs") as typeof import("node:fs");
	const count = (s: string, sub: string) => s.split(sub).length - 1;
	let backfill: () => void;
	// A pre-flip agent: repo set up, memory/ dir empty (setupAgentRepo made it).
	const EMPTY = "bf-empty";
	// Already-authored memory: must be left untouched.
	const AUTHORED = "bf-authored";
	// No repo yet (still initializing/failed): must be skipped.
	const NO_REPO = "bf-norepo";
	// Marked for deletion: must be skipped.
	const DELETING = "bf-deleting";
	// A local-path agent: no <agent-home>/worktree; its real worktree is an
	// external repo stored on its worktrees row. This is the John (5e781222) case.
	const EXTERNAL = "bf-external";
	const EXTERNAL_WT = join(TEST_HOME, "external-repos", EXTERNAL);

	beforeAll(async () => {
		await setupAgentRepo({ agentId: EMPTY, source: { type: "init" } });
		await setupAgentRepo({ agentId: AUTHORED, source: { type: "init" } });
		await setupAgentRepo({ agentId: DELETING, source: { type: "init" } });
		// AUTHORED already has a non-empty canonical file.
		fs.writeFileSync(
			join(getAgentMemoryDir(AUTHORED), "AGENT.md"),
			"# HAND AUTHORED — do not touch\n",
			"utf8",
		);
		// EXTERNAL: only an external git repo exists; no derived worktree, empty
		// memory/ (never created) — mirrors a pre-flip local-path agent exactly.
		fs.mkdirSync(join(EXTERNAL_WT, ".git", "info"), { recursive: true });

		const rows = [
			{ id: EMPTY, name: "Empty", runtime: "claude", deletingAt: null },
			{ id: AUTHORED, name: "Authored", runtime: "codex", deletingAt: null },
			{ id: NO_REPO, name: "NoRepo", runtime: "claude", deletingAt: null },
			{
				id: DELETING,
				name: "Deleting",
				runtime: "codex",
				deletingAt: Date.now(),
			},
			{ id: "bf-nullrt", name: "NullRt", runtime: null, deletingAt: null },
			{
				id: EXTERNAL,
				name: "John",
				runtime: "claude",
				deletingAt: null,
				worktreeId: "wt-external",
			},
		];

		// Stub the DB: the workspaces enumeration returns `rows`; a worktrees
		// lookup (only made for the agent carrying a worktreeId) returns the
		// external repo path. Keyed on table identity so the two selects differ.
		mock.module("./local-db", () => ({
			localDb: {
				select: (..._cols: unknown[]) => ({
					from: (table: unknown) => ({
						where: (..._w: unknown[]) => ({
							all: () => (table === workspaces ? rows : []),
							get: () =>
								table === worktrees ? { path: EXTERNAL_WT } : undefined,
						}),
					}),
				}),
			},
		}));
		process.env.ADE_MEMORY_SCAFFOLD = "true";
		backfill = (await import("./agent-memory-backfill")).backfillAgentMemory;
		backfill();
	});

	it("scaffolds an agent whose memory/ dir was empty", () => {
		const mem = getAgentMemoryDir(EMPTY);
		expect(fs.existsSync(join(mem, "AGENT.md"))).toBe(true);
		expect(fs.existsSync(join(mem, "MEMORY.md"))).toBe(true);
		// USER.md lives at the shared path, never per-agent.
		expect(fs.existsSync(join(mem, "USER.md"))).toBe(false);
		expect(fs.existsSync(getSharedUserProfilePath())).toBe(true);
		// Bridge for its runtime (claude) is written too.
		expect(fs.existsSync(join(getAgentWorktreePath(EMPTY), "CLAUDE.md"))).toBe(
			true,
		);
	});

	it("leaves an already-authored memory untouched (skips it entirely)", () => {
		const mem = getAgentMemoryDir(AUTHORED);
		expect(readFileSync(join(mem, "AGENT.md"), "utf8")).toBe(
			"# HAND AUTHORED — do not touch\n",
		);
		// Skipped before scaffolding, so the other canonical files were not created.
		expect(fs.existsSync(join(mem, "MEMORY.md"))).toBe(false);
	});

	it("skips an agent with no repo yet", () => {
		expect(fs.existsSync(join(getAgentMemoryDir(NO_REPO), "AGENT.md"))).toBe(
			false,
		);
	});

	it("skips an agent marked for deletion", () => {
		expect(fs.existsSync(join(getAgentMemoryDir(DELETING), "AGENT.md"))).toBe(
			false,
		);
	});

	it("scaffolds a local-path agent using its EXTERNAL worktree from the DB", () => {
		// Memory scaffolded under the derived agent-home (as for any agent).
		expect(fs.existsSync(join(getAgentMemoryDir(EXTERNAL), "AGENT.md"))).toBe(
			true,
		);
		// Bridges written into the EXTERNAL repo, not the derived worktree dir.
		expect(fs.existsSync(join(EXTERNAL_WT, "CLAUDE.md"))).toBe(true);
		expect(
			fs.existsSync(join(getAgentWorktreePath(EXTERNAL), "CLAUDE.md")),
		).toBe(false);
		// Git-excluded in the external repo.
		const exclude = readFileSync(
			join(EXTERNAL_WT, ".git", "info", "exclude"),
			"utf8",
		);
		expect(exclude).toContain("# Roster agent bridge files");
	});

	it("is idempotent: a second run neither re-creates nor duplicates", () => {
		// Simulate the agent having since edited its USER.md.
		const userPath = join(getAgentMemoryDir(EMPTY), "USER.md");
		const edited = "# EDITED BY AGENT\n";
		fs.writeFileSync(userPath, edited, "utf8");
		backfill();
		// Memory is now non-empty, so the second run skips it — edit preserved.
		expect(readFileSync(userPath, "utf8")).toBe(edited);
		const excludePath = join(
			getAgentWorktreePath(EMPTY),
			".git",
			"info",
			"exclude",
		);
		expect(
			count(readFileSync(excludePath, "utf8"), "# Roster agent bridge files"),
		).toBe(1);
	});
});

describe("resolveAgentWorktreePath — DB is the source of truth", () => {
	let resolve: typeof import("./agent-worktree").resolveAgentWorktreePath;
	const EXTERNAL = join(TEST_HOME, "some", "external", "repo");

	beforeAll(async () => {
		// A DB that always resolves a worktree row to the external path. Only
		// consulted when a worktreeId is supplied.
		mock.module("./local-db", () => ({
			localDb: {
				select: (..._c: unknown[]) => ({
					from: (_t: unknown) => ({
						where: (..._w: unknown[]) => ({ get: () => ({ path: EXTERNAL }) }),
					}),
				}),
			},
		}));
		resolve = (await import("./agent-worktree")).resolveAgentWorktreePath;
	});

	it("returns the derived path when the agent has no worktree row", () => {
		expect(resolve("agent-x", null)).toBe(getAgentWorktreePath("agent-x"));
		expect(resolve("agent-x", undefined)).toBe(getAgentWorktreePath("agent-x"));
	});

	it("returns the worktrees.path from the DB (external) when a row exists", () => {
		expect(resolve("agent-x", "wt-1")).toBe(EXTERNAL);
	});
});

describe("backfill on staged null-worktree agents (boot-hang regression)", () => {
	// Repro of the boot dataset: many agents with worktree_id = NULL and no
	// repos/agent-homes (staged demo data). Each must be SKIPPED (no worktree/
	// .git), the pass must scaffold nothing, and — the regression guard — it must
	// RETURN (a hanging backfill would never let this test finish). A null
	// worktree_id must never trigger a DB worktrees lookup either.
	const fs = require("node:fs") as typeof import("node:fs");
	let backfill: () => void;
	const ids = Array.from({ length: 19 }, (_, i) => `demo-${i}`);
	let worktreesLookups = 0;

	beforeAll(async () => {
		const rows = ids.map((id, i) => ({
			id,
			name: `Demo ${i}`,
			runtime: "claude",
			deletingAt: null,
			worktreeId: null, // staged agents have no worktree row
		}));
		mock.module("./local-db", () => ({
			localDb: {
				select: (..._c: unknown[]) => ({
					from: (table: unknown) => ({
						where: (..._w: unknown[]) => ({
							all: () => (table === workspaces ? rows : []),
							get: () => {
								if (table === worktrees) worktreesLookups++;
								return undefined;
							},
						}),
					}),
				}),
			},
		}));
		process.env.ADE_MEMORY_SCAFFOLD = "true";
		backfill = (await import("./agent-memory-backfill")).backfillAgentMemory;
		backfill();
	});

	it("returns without hanging and scaffolds none of the staged agents", () => {
		for (const id of ids) {
			expect(fs.existsSync(join(getAgentMemoryDir(id), "AGENT.md"))).toBe(
				false,
			);
			expect(fs.existsSync(join(getAgentWorktreePath(id), "CLAUDE.md"))).toBe(
				false,
			);
		}
	});

	it("never does a worktrees DB lookup for a null worktree_id", () => {
		expect(worktreesLookups).toBe(0);
	});
});
