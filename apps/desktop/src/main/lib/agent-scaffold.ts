import {
	appendFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmdirSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AgentRuntime, VcsKind } from "@roster/local-db";
import {
	getAgentCodexHome,
	getAgentHome,
	getAgentMemoryDir,
	getAgentWorktreePath,
	getSharedUserProfilePath,
} from "./agent-home";

/**
 * Memory scaffold written on agent creation (Roster Phase E, docs/memory.md).
 * Writes the canonical memory/*.md files, the write-back protocol,
 * a skills seed, the SHARED user profile (<ROSTER_HOME_DIR>/memory/USER.md,
 * one per user across all agents), and the per-runtime bridge files that point
 * each CLI at the canonical memory. Electron-free so it composes with
 * setupAgentRepo and is unit-verifiable. Templates are kept short — they are
 * context on every turn.
 *
 * Faithful to the Hermes agent (github.com/NousResearch/hermes-agent): the
 * self-curation guidance in .writeback-protocol.md is ported from Hermes'
 * `memory` tool description (tools/memory_tool.py MEMORY_SCHEMA), AGENT.md
 * mirrors the short SOUL.md identity, the SKILL.md template follows Hermes'
 * skill-authoring standards (agent/learn_prompt.py), and the session-end
 * reflection is an Roster adaptation of Hermes' post-turn background review
 * (agent/background_review.py). See the spec for the full mapping.
 */

export interface ScaffoldParams {
	agentId: string;
	agentName: string;
	runtime: AgentRuntime;
	/** Human name for USER.md; falls back to "the user". */
	userName?: string;
	/**
	 * Optional role/purpose that seeds AGENT.md's persona section. Blank (the
	 * default flow) leaves an invitation for the agent to define its focus
	 * through conversation. A parallel agent-role-ui surface passes this from
	 * the New Agent modal.
	 */
	role?: string;
	/**
	 * Absolute worktree path the per-runtime bridge files (CLAUDE.md,
	 * .claude/, .git/info/exclude) are written into. Defaults to
	 * the derived <agent-home>/worktree. The local-path creation flow stores an
	 * EXTERNAL repo path on the workspace's worktrees row — for those agents the
	 * caller must pass that path so bridges land in the real repo, not a
	 * derived dir that doesn't exist. Memory/skills always stay under
	 * <agent-home> regardless. Callers should ensure the path exists and is a
	 * git repo before passing it.
	 */
	worktreePath?: string;
	/**
	 * Version control of the agent's workspace. "none" (folder agents) selects
	 * prompt copy with no git vocabulary — the identity and operating brief must
	 * not prime the agent toward branches/commits/PRs that don't exist.
	 * Defaults to "git" for legacy callers.
	 */
	vcs?: VcsKind;
}

function sub(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/**
 * Write `content` only if the target is MISSING. Makes the scaffold idempotent
 * so the launch-time backfill (agent-memory-backfill.ts) can re-run over an
 * existing agent without ever clobbering a canonical file or bridge the user
 * (or the agent) has already touched. Deliberately does NOT re-seed an
 * existing-but-empty file: emptying a memory file is a valid user action
 * ("forget this") and must stick across backfill re-runs. On a fresh agent
 * every file is absent, so this behaves exactly like a plain write.
 */
function writeIfMissing(path: string, content: string): void {
	if (existsSync(path)) return;
	writeFileSync(path, content, "utf8");
}

// AGENT.md is the Roster analog of Hermes' SOUL.md: a short identity that leads the
// context (who you are + voice), followed by an operating brief. Hermes keeps
// SOUL.md to a single prose paragraph — we keep AGENT.md deliberately short too.
// {{role_section}} is built in code from the optional `role` param;
// {{workspace_kind}} / {{workspace_word}} / {{vcs_brief}} come from `vcs` so a
// folder agent's prompt never mentions git.
const AGENT_MD = `# {{agent_name}}

You are {{agent_name}}, an autonomous {{agent_kind}} working in {{workspace_kind}}.
You are direct, precise, and prize being genuinely useful over being
verbose. You admit uncertainty, prefer small verifiable changes, and you keep
your own persistent memory (MEMORY.md, USER.md) current as you learn — read it,
trust it, and maintain it per the write-back protocol.

## Role
{{role_section}}

## Tools
<!-- The tools and connectors this agent's tasks require, and when to reach for
     each. Roster appends a line here when a connector is wired up; refine the
     "use it for" notes as the role sharpens. Prefer these over improvising. -->
- (none yet — connectors added in the Connectors panel appear here)

## Operating brief
- Work only within your {{workspace_word}}: {{worktree_path}}{{vcs_brief}}
- Prefer small, verifiable changes. Run the project's checks before declaring done.
- When you learn something durable about {{user_name}} or the project, save it to
  memory per the write-back protocol.
- Reusable procedures become skills under {{agent_home}}/skills/, not memory notes.

## Standing preferences
- (none yet — {{user_name}} will add these, or you will learn them)
`;

// Seeded at the SHARED path (<ROSTER_HOME_DIR>/memory/USER.md) — one profile
// for all agents, so a preference learned by one agent benefits every agent.
const USER_MD = `# User profile

<!-- SHARED across ALL of the user's agents. Any agent may update it; every
     agent reads it. Agent-specific notes belong in that agent's MEMORY.md. -->

- Name: {{user_name}}
- (The agent maintains this file. Add stable facts about the user: role,
  timezone, tech preferences, communication style, hard "always/never" rules.)

## Preferences
- (learned over time)

## Do not
- (pet peeves / things to avoid)
`;

const MEMORY_MD = `# Memory — {{agent_name}}

<!-- Maintain this file per the write-back protocol. One fact per bullet.
     Keep inline notes under ~2,200 chars; offload detail to memory/<topic>.md
     and leave a one-line pointer here. -->

## Environment
- Agent home: {{agent_home}}
- Runtime: {{runtime}}
- Created: {{created_date}}

## Project
- (conventions, build/test commands, architecture notes — learned over time)

## Lessons
- (tool quirks, workarounds, corrections that shouldn't repeat)

## Detail files
- (e.g. \`- debugging → memory/debugging.md\`)
`;

// Ported from Hermes' `memory` tool description (tools/memory_tool.py
// MEMORY_SCHEMA — the "WHEN / TARGETS / SKIP / IF FULL" self-curation guidance)
// and its background-review prompts (agent/background_review.py), adapted to
// file-edit semantics: Roster has no custom memory tool, so the agent edits these
// files with its normal Edit/Write tools. The reflection section is the Roster
// analog of Hermes' post-turn learning loop.
const WRITEBACK_PROTOCOL = `## Your persistent memory — how to maintain it

You have three memory files, loaded into your context at the start of every
session. Memory is injected into every future turn, so keep entries compact and
high-signal — everything here costs tokens forever. The best memory stops
{{user_name}} from having to repeat themselves.

- {{shared_user_md}} — who the human is: name, role, preferences,
  communication style, hard "always/never" rules. Target < 1,375 chars.
  This file is SHARED across ALL of {{user_name}}'s agents — a preference you
  learn here benefits every agent, and other agents' learnings appear here for
  you. Keep it strictly about the user; agent-specific notes go to MEMORY.md.
- {{agent_home}}/memory/MEMORY.md — your own notes: environment facts, project
  conventions, tool quirks, lessons learned, and a short index of any
  memory/<topic>.md detail files. Target < 2,200 chars for the inline notes.
- {{agent_home}}/memory/AGENT.md  — your persona and standing brief. You rarely
  change this; the human owns it.

WHEN to save (edit the file with your normal file tools, proactively — don't
wait to be asked):
- the user states a preference, correction, or personal detail  → USER.md
- you learn a stable fact about their environment, stack, conventions, or
  workflow  → MEMORY.md
- a correction would otherwise be repeated next session
Priority when space is tight: user preferences & corrections > environment
facts > procedures.

SKIP: trivial or obvious info, easily re-discovered facts, raw data/log dumps,
task progress, completed-work logs, temporary TODO or debugging state, one-off
paths. Reusable step-by-step procedures belong in a skill (see below), not a
memory entry.

FORMAT: one fact per bullet, present tense, no dates unless load-bearing.
Convert relative dates to absolute. If MEMORY.md's inline notes grow past the
target, move the least-critical section into memory/<topic>.md and leave a
one-line pointer in MEMORY.md.

WHEN FULL: don't just append. Consolidate — merge overlapping bullets, drop the
stalest, then add, all in one edit. A write that only ever grows becomes a
bloated memory that gets ignored; that is the failure mode. Editing is cheap.

Never write secrets, tokens, or anything you wouldn't want replayed into a
future prompt.

## Skills — reusable know-how

A skill is a folder under {{agent_home}}/skills/<name>/ with a SKILL.md
(agentskills.io format). Only its name + one-line description sit in context;
the body loads on demand. Create a skill for any reusable, multi-step procedure
or a class-of-task lesson — NOT for one-off facts (those go in MEMORY.md). When
the user corrects your style, format, or workflow for a kind of task, embed that
correction in the skill that governs that task, so the next session starts
already knowing.

## Session-end reflection

Before you finish a session (or when a substantial piece of work concludes),
review the conversation and update your memory and skills so the next session
starts smarter. Be active: a review that changes nothing is usually a missed
learning opportunity, not a neutral outcome.

1. Memory — did the user reveal a preference, correction, personal detail, or
   expectation about how you should work (→ USER.md), or did you learn a stable
   fact about their environment/stack/conventions (→ MEMORY.md)? Save it, per
   the WHEN/SKIP rules above.
2. Skills — if the user corrected your style, tone, format, or workflow, embed
   the lesson in the skill that governs this class of task (create one if none
   exists). If a non-trivial technique, fix, or debugging path emerged, capture
   it. A preference correction belongs in a skill, not only in memory.

Do NOT capture as durable memory or skills (these harden into false constraints
that bite you later when the environment changes):
- environment-dependent failures: missing binaries, "command not found",
  unconfigured credentials, uninstalled packages — the user can fix these.
- negative claims about tools ("X is broken", "can't use Y") — capture the FIX
  instead, under a troubleshooting note.
- transient errors that resolved on retry — the lesson is the retry, not the
  failure.
- one-off task narratives.

If the session produced no durable fact and no correction, that's fine — make no
changes and finish.
`;

const SKILLS_README = `# Skills for {{agent_name}}

Each skill is a folder with a SKILL.md (agentskills.io format). Only the
name + description sit in context; the body loads on demand. Create a skill
for any reusable, multi-step procedure or class-of-task lesson — not for
one-off facts (those go in MEMORY.md). See SKILL.template.md for the frontmatter
and section order to follow.
`;

// SKILL authoring template — mirrors Hermes' skill-authoring standards
// (agent/learn_prompt.py _AUTHORING_STANDARDS) and the shipped SKILL.md files:
// description <=60 chars, version, optional platforms, metadata.<ns>.tags, and
// the canonical body section order. agentskills.io-compatible.
const SKILL_TEMPLATE = `---
name: my-skill
description: One line, <= 60 chars, what this does.
version: 0.1.0
platforms: [macos, linux]
metadata:
  ade:
    tags: [Example]
---

# Skill Title

Two or three sentences: what it does, what it does NOT do, and the key
dependency stance.

## When to Use
- Concrete trigger phrases / conditions.

## Prerequisites
- Exact env vars, install steps, credentials (omit if none).

## Procedure
1. Step one — copy-paste-exact commands.
2. Step two.

## Pitfalls
- Known limits and things that look broken but aren't.

## Verification
A single command or check that proves the skill worked.
`;

/**
 * Scaffold a new, user-initiated skill from the authoring template. Returns
 * the absolute path of the created SKILL.md. Used by the Agent panel's
 * "New skill" action — the agent itself writes skills directly to disk.
 */
export function createAgentSkill(agentId: string, name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) throw new Error("Skill names need at least one letter or number");
	const skillDir = join(getAgentHome(agentId), "skills", slug);
	const skillPath = join(skillDir, "SKILL.md");
	if (existsSync(skillPath)) {
		throw new Error(`A skill named "${slug}" already exists`);
	}
	mkdirSync(skillDir, { recursive: true });
	const body = SKILL_TEMPLATE.replace(
		"name: my-skill",
		`name: ${slug}`,
	).replace("# Skill Title", `# ${name.trim()}`);
	writeFileSync(skillPath, body, "utf8");
	return skillPath;
}

const CLAUDE_BRIDGE = `@{{agent_home}}/memory/AGENT.md
@{{shared_user_md}}
@{{agent_home}}/memory/.writeback-protocol.md
<!-- MEMORY.md is loaded via Claude Code native auto-memory (autoMemoryDirectory). -->
`;

// Claude Code Stop-hook script: the native analog of Hermes' post-turn
// background review (agent/background_review.py). When the agent tries to stop,
// this forces ONE review turn (decision:block feeds `reason` back to the model);
// the stop_hook_active guard means the review turn itself stops cleanly instead
// of looping. Runs under `node` (always present in a Claude Code host); reads
// the hook JSON from stdin (fd 0). Lives in .claude/ (git-excluded) so it never
// enters the repo. Also enforces: a trivial-session skip (tiny transcript →
// nothing durable to reflect on), a <memory>/.reflect.lock so concurrent
// sessions of the same agent don't reflect simultaneously, and per-file size
// budgets appended to the reflection prompt. See docs/memory.md.
function reflectHookScript(agentHome: string, userName: string): string {
	const memoryDir = join(agentHome, "memory");
	const sharedUserMd = getSharedUserProfilePath();
	const reason =
		`[session reflection] Before you finish, review this conversation and update ` +
		`your persistent memory and skills so the next session starts smarter, per the ` +
		`Session-end reflection section of your write-back protocol ` +
		`(${agentHome}/memory/.writeback-protocol.md). Save durable preferences/facts ` +
		`about ${userName} to the shared USER.md (${sharedUserMd}), stable ` +
		`environment/convention facts to MEMORY.md, ` +
		`and embed any style/format/workflow correction in the skill that governs that ` +
		`class of task under ${agentHome}/skills/. Do NOT capture environment-dependent ` +
		`failures, negative tool claims, transient errors, or one-off narratives. Make ` +
		`the edits with your file tools, then finish. If nothing durable came up, make no ` +
		`changes and stop.`;
	return `#!/usr/bin/env node
// Roster session-reflection hook (Claude Code Stop hook). Native analog of the
// Hermes post-turn review loop. Generated by agent-scaffold.ts; do not edit —
// it is regenerated on scaffold. See docs/memory.md.
//
// Behavior:
// - stop_hook_active (the post-reflection stop): clear the lock, exit 0 — the
//   guard that makes the reflection turn stop cleanly instead of looping.
// - Trivial-session skip: transcript_path smaller than 16 KB → no reflection.
// - Concurrency lock: a fresh <memory>/.reflect.lock (mtime < 10 min) means
//   another session of this agent is already reflecting → exit 0.
// - Budget check: MEMORY.md / shared USER.md over their soft size targets get a
//   consolidate-first NOTE appended to the reflection prompt.
import { readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
const LOCK_PATH = ${JSON.stringify(join(memoryDir, ".reflect.lock"))};
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const TRIVIAL_TRANSCRIPT_BYTES = 16 * 1024;
let raw = "";
try { raw = readFileSync(0, "utf8"); } catch {}
let data = {};
try { data = JSON.parse(raw || "{}"); } catch {}
// Already inside the reflection turn we injected — release the lock and let it
// stop (no loop).
if (data && data.stop_hook_active) {
  try { unlinkSync(LOCK_PATH); } catch {}
  process.exit(0);
}
// Trivial-session skip: a tiny transcript has nothing durable to reflect on.
// Absent field or unreadable file → proceed (fail open).
if (data && typeof data.transcript_path === "string" && data.transcript_path) {
  try {
    if (statSync(data.transcript_path).size < TRIVIAL_TRANSCRIPT_BYTES) process.exit(0);
  } catch {}
}
// Concurrency lock: a fresh lock means another session is mid-reflection.
// A stale lock (>10 min — e.g. a crashed session) is overwritten below.
try {
  if (Date.now() - statSync(LOCK_PATH).mtimeMs < LOCK_MAX_AGE_MS) process.exit(0);
} catch {}
try {
  writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
} catch {}
let reason = ${JSON.stringify(reason)};
// Size budgets: over-target files get a consolidate-first note in the prompt.
const BUDGETS = [
  [${JSON.stringify(join(memoryDir, "MEMORY.md"))}, 2200],
  [${JSON.stringify(sharedUserMd)}, 1375],
];
for (const [file, target] of BUDGETS) {
  try {
    const n = statSync(file).size;
    if (n > target) {
      reason += \` NOTE: \${file} is over its size budget (\${n} chars > \${target}). Consolidate before adding: merge overlapping bullets, drop the stalest.\`;
    }
  } catch {}
}
process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
`;
}

/**
 * Bridge files written into the worktree (git-excluded, never committed).
 * .mcp.json is the agent's personal connector config (see agent-connectors.ts)
 * — personal wiring, not project code, so it stays out of the repo too.
 */
const BRIDGE_EXCLUDES = ["CLAUDE.md", ".claude/", "AGENTS.md", ".mcp.json"];

/** One row of the Codex skills index. */
interface SkillIndexEntry {
	name: string;
	description: string;
	/** Absolute path to the SKILL.md. */
	path: string;
}

/**
 * Index the agent's skills (<agent-home>/skills/<name>/SKILL.md) for the Codex
 * bridge: name + one-line description in context, body read on demand.
 * Frontmatter `name:`/`description:` are preferred; a skill without frontmatter
 * falls back to its directory name and the first non-heading body line.
 */
function readSkillIndex(skillsDir: string): SkillIndexEntry[] {
	if (!existsSync(skillsDir)) return [];
	const entries: SkillIndexEntry[] = [];
	let dirents: import("node:fs").Dirent[];
	try {
		dirents = readdirSync(skillsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	for (const dirent of dirents) {
		if (!dirent.isDirectory()) continue;
		const skillPath = join(skillsDir, String(dirent.name), "SKILL.md");
		if (!existsSync(skillPath)) continue;
		let name = String(dirent.name);
		let description = "";
		try {
			const text = readFileSync(skillPath, "utf8");
			const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			if (fm) {
				const nameMatch = fm[1].match(/^name:\s*(.+)$/m);
				const descMatch = fm[1].match(/^description:\s*(.+)$/m);
				if (nameMatch) name = nameMatch[1].trim();
				if (descMatch) description = descMatch[1].trim();
			}
			if (!description) {
				// No frontmatter description: first non-empty, non-heading body line.
				const body = fm ? text.slice(fm[0].length) : text;
				for (const line of body.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith("#")) continue;
					description = trimmed;
					break;
				}
			}
		} catch {
			// Unreadable SKILL.md — index it by name only.
		}
		entries.push({
			name,
			description: description || "(no description)",
			path: skillPath,
		});
	}
	return entries;
}

// FIX 5 (docs/memory.md): Codex has no Stop hook, so its session-end reflection
// is convention-driven — this standing instruction closes the bridge.
const CODEX_REFLECTION_FOOTER =
	"Before you consider a task complete, run the session-end reflection above " +
	"and update MEMORY.md / the shared USER.md / skills if anything durable was " +
	"learned.";

/**
 * Regenerate <agent-home>/.codex/AGENTS.md from the canonical memory files.
 * Codex cannot @import, so its bridge is the concatenation, rebuilt on each
 * launch (and once at creation): AGENT.md + the SHARED USER.md + MEMORY.md +
 * the write-back protocol (whose session-end reflection Codex follows by
 * convention — no stop hook), then a skills index (name/description in
 * context, body on demand) and a standing reflect-before-done instruction.
 * Call this before launching a codex agent.
 */
export function regenerateCodexAgentsMd(agentId: string): void {
	const memoryDir = getAgentMemoryDir(agentId);
	const codexHome = getAgentCodexHome(agentId);
	mkdirSync(codexHome, { recursive: true });

	const agentParts: string[] = [];
	for (const file of ["AGENT.md", "MEMORY.md", ".writeback-protocol.md"]) {
		const p = join(memoryDir, file);
		if (existsSync(p)) {
			agentParts.push(readFileSync(p, "utf8"));
		}
	}
	// No canonical memory (e.g. an agent created before the scaffold was
	// enabled): leave any existing bridge untouched rather than clobbering it
	// with an empty file. Codex then falls back to no global AGENTS.md. The
	// shared USER.md doesn't count — it exists independently of this agent.
	if (agentParts.length === 0) return;

	const parts: string[] = [agentParts[0]];
	// The user profile is the SHARED file (one per user, all agents), spliced in
	// after AGENT.md. A legacy per-agent memory/USER.md is left on disk but no
	// longer bridged.
	const sharedUserMd = getSharedUserProfilePath();
	if (existsSync(sharedUserMd)) {
		parts.push(readFileSync(sharedUserMd, "utf8"));
	}
	parts.push(...agentParts.slice(1));

	const skills = readSkillIndex(join(getAgentHome(agentId), "skills"));
	if (skills.length > 0) {
		const lines = skills.map(
			(s) =>
				`- **${s.name}** — ${s.description} (read ${s.path} before doing this kind of task)`,
		);
		parts.push(`## Skills\n\n${lines.join("\n")}`);
	}

	parts.push(CODEX_REFLECTION_FOOTER);
	writeFileSync(
		join(codexHome, "AGENTS.md"),
		`${parts.join("\n\n")}\n`,
		"utf8",
	);
}

/**
 * Ensure <worktree>/.claude/skills is a symlink to the agent's canonical
 * skills dir, so skills the agent writes are actually loaded back by Claude
 * Code. Called at scaffold time AND before every Claude session launch
 * (terminal createOrAttach), mirroring the per-launch Codex bridge regen.
 *
 * - Correct symlink already in place → no-op.
 * - Symlink pointing elsewhere → replaced.
 * - A REAL directory with content is user-owned: warn and leave it (an empty
 *   real dir is replaced with the link).
 * Best-effort: never throws, so it can sit on the terminal-launch path.
 */
export function ensureClaudeSkillsLink(
	agentId: string,
	worktreePath?: string,
): void {
	try {
		const skillsDir = join(getAgentHome(agentId), "skills");
		const resolvedWorktree =
			worktreePath?.trim() || getAgentWorktreePath(agentId);
		if (!existsSync(resolvedWorktree)) return;
		const claudeDir = join(resolvedWorktree, ".claude");
		mkdirSync(claudeDir, { recursive: true });
		const linkPath = join(claudeDir, "skills");

		let stat: import("node:fs").Stats | undefined;
		try {
			stat = lstatSync(linkPath);
		} catch {
			// Nothing at the path — create the link below.
		}
		if (stat?.isSymbolicLink()) {
			const target = readlinkSync(linkPath);
			// A relative link target resolves against the link's own directory.
			if (resolve(dirname(linkPath), target) === resolve(skillsDir)) return;
			unlinkSync(linkPath);
		} else if (stat?.isDirectory()) {
			const hasContent = readdirSync(linkPath).length > 0;
			if (hasContent) {
				console.warn(
					`[agent-scaffold] ${linkPath} is a real directory with content; ` +
						`leaving it in place (user-owned). Agent skills in ${skillsDir} ` +
						`will not be loaded by Claude Code for this worktree.`,
				);
				return;
			}
			rmdirSync(linkPath);
		} else if (stat) {
			// A stray regular file — replace it with the link.
			unlinkSync(linkPath);
		}
		mkdirSync(skillsDir, { recursive: true });
		symlinkSync(skillsDir, linkPath, "dir");
	} catch (error) {
		console.warn(
			"[agent-scaffold] Failed to ensure .claude/skills link:",
			error,
		);
	}
}

/**
 * Build AGENT.md's "## Role" body from the optional role/purpose string.
 * Provided → the role text verbatim (as a bullet). Blank (default flow) → an
 * invitation for the agent to define its focus through conversation, which
 * matches the user's default of building the persona in-session.
 */
function roleSection(role: string | undefined, userName: string): string {
	const trimmed = role?.trim();
	if (trimmed) return `- ${trimmed}`;
	return (
		`- Not set yet. You and ${userName} will define your focus through\n` +
		`  conversation; once it's clear, write a one-line purpose here and refine\n` +
		`  it over time.`
	);
}

export function scaffoldAgentMemory({
	agentId,
	agentName,
	runtime,
	userName,
	role,
	worktreePath: worktreePathOverride,
	vcs,
}: ScaffoldParams): void {
	const agentHome = getAgentHome(agentId);
	const memoryDir = getAgentMemoryDir(agentId);
	// Bridges go into the agent's real worktree — which is the external repo path
	// for local-path agents, and the derived <agent-home>/worktree otherwise.
	// Memory/skills stay under <agent-home> either way.
	const worktreePath =
		worktreePathOverride?.trim() || getAgentWorktreePath(agentId);
	const skillsDir = join(agentHome, "skills");
	const resolvedUserName = userName?.trim() || "the user";
	const sharedUserMd = getSharedUserProfilePath();
	const isGit = vcs !== "none";

	const vars: Record<string, string> = {
		agent_name: agentName,
		agent_id: agentId,
		agent_home: agentHome,
		user_name: resolvedUserName,
		shared_user_md: sharedUserMd,
		role_section: roleSection(role, resolvedUserName),
		runtime,
		created_date: new Date().toISOString().slice(0, 10),
		worktree_path: worktreePath,
		workspace_kind: isGit ? "a dedicated git worktree" : "a dedicated folder",
		workspace_word: isGit ? "worktree" : "folder",
		// Only git agents are framed as coding agents; a folder agent's work is
		// whatever its role says (tickets, research, ops) and the word "coding"
		// would mis-prime it.
		agent_kind: isGit ? "coding agent" : "agent",
		vcs_brief: isGit
			? ""
			: "\n- Your folder is NOT a git repository: there are no branches, commits," +
				"\n  or pull requests here. Do not run git or gh — changes take effect by" +
				"\n  saving files.",
	};

	mkdirSync(memoryDir, { recursive: true });
	mkdirSync(skillsDir, { recursive: true });

	// Canonical memory files (source of truth, never committed). Idempotent:
	// a file that already exists (even emptied on purpose) is preserved.
	writeIfMissing(join(memoryDir, "AGENT.md"), sub(AGENT_MD, vars));
	writeIfMissing(join(memoryDir, "MEMORY.md"), sub(MEMORY_MD, vars));
	writeIfMissing(
		join(memoryDir, ".writeback-protocol.md"),
		sub(WRITEBACK_PROTOCOL, vars),
	);
	// The user profile is SHARED across all agents (one user, one profile):
	// seeded once at <ROSTER_HOME_DIR>/memory/USER.md, first scaffold wins.
	// Per-agent memory/USER.md is no longer created; a legacy one is left on
	// disk but the bridges point at the shared file.
	mkdirSync(dirname(sharedUserMd), { recursive: true });
	writeIfMissing(sharedUserMd, sub(USER_MD, vars));
	writeIfMissing(join(skillsDir, "README.md"), sub(SKILLS_README, vars));
	writeIfMissing(
		join(skillsDir, "SKILL.template.md"),
		sub(SKILL_TEMPLATE, vars),
	);

	// Per-runtime bridge files in the worktree (point each CLI at canonical
	// memory). Idempotent so we never clobber a bridge the user customized.
	writeIfMissing(join(worktreePath, "CLAUDE.md"), sub(CLAUDE_BRIDGE, vars));
	const claudeDir = join(worktreePath, ".claude");
	mkdirSync(claudeDir, { recursive: true });
	// Session-reflection hook script + settings that wire it as a Stop hook and
	// point native auto-memory at the canonical dir. Both are Claude-Code-only
	// surfaces; harmless to the other runtimes.
	const reflectHookPath = join(claudeDir, "reflect-on-stop.mjs");
	writeIfMissing(
		reflectHookPath,
		reflectHookScript(agentHome, resolvedUserName),
	);
	writeIfMissing(
		join(claudeDir, "settings.json"),
		`${JSON.stringify(
			{
				autoMemoryDirectory: join(memoryDir),
				autoMemoryEnabled: true,
				hooks: {
					Stop: [
						{
							matcher: "*",
							hooks: [
								{
									type: "command",
									command: `node ${JSON.stringify(reflectHookPath)}`,
									timeout: 120,
								},
							],
						},
					],
				},
			},
			null,
			2,
		)}\n`,
	);
	// Skills the agent writes must be loaded back: link the worktree's
	// .claude/skills at the canonical skills dir (also re-ensured before every
	// Claude session launch). Covered by the ".claude/" git-exclude below.
	ensureClaudeSkillsLink(agentId, worktreePath);
	// Keep the generated bridge files out of the repo (local, per-worktree).
	// Guard against a duplicate block when re-run by the backfill.
	const excludePath = join(worktreePath, ".git", "info", "exclude");
	const excludeMarker =
		"# Roster agent bridge files (generated, not committed)";
	if (existsSync(join(worktreePath, ".git"))) {
		mkdirSync(join(worktreePath, ".git", "info"), { recursive: true });
		const existingExclude = existsSync(excludePath)
			? readFileSync(excludePath, "utf8")
			: "";
		if (!existingExclude.includes(excludeMarker)) {
			appendFileSync(
				excludePath,
				`\n${excludeMarker}\n${BRIDGE_EXCLUDES.join("\n")}\n`,
				"utf8",
			);
		}
	}

	// Codex needs the concatenated bridge (it can't import). Generate it now;
	// it is regenerated on each codex launch.
	if (runtime === "codex") {
		regenerateCodexAgentsMd(agentId);
	}
}
