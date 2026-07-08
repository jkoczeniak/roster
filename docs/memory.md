# Agent memory

Every ADE agent has a persistent, self-curated memory. It is what makes an agent an identity rather than a chat window: the agent reads its memory at the start of every session and writes back to it as it learns, so it accumulates knowledge about you and your project over time.

The system is adapted from the [Hermes agent](https://github.com/NousResearch/hermes-agent) (MIT). ADE copies Hermes' *shape* — a bounded, file-backed memory the agent maintains itself — but replaces Hermes' mechanism (a custom memory tool inside a bespoke agent loop) with each coding CLI's own native context-file feature. ADE never forks or patches a CLI.

## Principles

- **Plain files are the source of truth.** Each agent owns a `memory/` directory of markdown. No database, no daemon, no injected tool.
- **Memory lives outside the git worktree.** It is a sibling of the worktree, so it is never committed to your code and survives branch and worktree changes.
- **Budgets are guidance, not gates.** Memory is injected into every turn and costs tokens forever, so the files carry soft size targets and the agent is told to consolidate rather than grow without bound. The reflection hook re-states a file's budget in the prompt once it is exceeded.
- **One canonical set of files, thin per-runtime bridges.** The same files feed Claude Code and Codex through small generated bridge files, so switching an agent's runtime never loses its memory.
- **The user is shared; the agent is not.** Who *you* are doesn't vary per agent, so the user profile is one file shared by every agent. Everything agent-specific stays in that agent's own memory.

## The files

Each agent has a home directory containing its worktree, its memory, and its skills. The user profile is the one file that lives *above* the agents, shared by all of them:

```
<ROSTER_HOME_DIR>/                    (~/.roster[-<ws>])
├── memory/
│   └── USER.md          # SHARED user profile — one per user, read by ALL agents
└── agents/<agent-id>/
    ├── worktree/            # the git worktree; the CLI's working directory
    │   ├── CLAUDE.md        # bridge: Claude Code (generated, git-excluded)
    │   └── .claude/         # Claude Code settings + reflection hook (generated)
    │       └── skills/      # symlink → <agent-home>/skills (so skills load back)
    ├── memory/              # CANONICAL memory — source of truth, never committed
    │   ├── AGENT.md         # persona / operating brief
    │   ├── MEMORY.md        # the agent's own notes + an index of topic files
    │   ├── .writeback-protocol.md   # the maintenance rules (see below)
    │   └── memories/        # optional granular topic files, one subject each
    ├── skills/              # reusable know-how, each a SKILL.md
    └── .codex/              # generated Codex bridge (for the Codex runtime)
```

**AGENT.md** is a short identity paragraph — who the agent is, its voice, its role, and its standing preferences. It is seeded once (optionally from the Role you give the agent when you create it) and rarely changes; you own it.

**USER.md** is the profile of you the agent maintains: your name, role, tech preferences, communication style, and hard "always/never" rules. It is **shared across all your agents** at `<ROSTER_HOME_DIR>/memory/USER.md` — a preference learned by one agent benefits every agent, and no agent has to re-learn you from scratch. It is seeded by the first agent scaffold and never re-seeded. Target size is under ~1,375 characters. (Agents created before this change may still have a per-agent `memory/USER.md` on disk; it is left in place but the bridges point at the shared file.)

**MEMORY.md** is the agent's own notebook: environment facts, project conventions, tool quirks, and lessons learned, plus a short index pointing to any longer `memories/<topic>.md` files. Target size is under ~2,200 characters for the inline notes; anything longer is offloaded to a topic file with a one-line pointer left behind.

**Skills** are reusable, multi-step procedures the agent writes for itself, each a folder with a `SKILL.md` in [agentskills.io](https://agentskills.io) format. Only a skill's name and one-line description sit in context; its body loads on demand. Skills are for repeatable procedures and class-of-task lessons — not one-off facts, which belong in MEMORY.md.

Skills the agent writes are actually loaded back:

- **Claude Code** discovers skills from `<worktree>/.claude/skills`, which ADE maintains as a symlink to the canonical `<agent-home>/skills` — created at scaffold time and re-ensured before every Claude session launch. A symlink pointing elsewhere is repaired; a *real* `.claude/skills` directory with content is treated as user-owned and left alone (with a logged warning). The `.claude/` dir is git-excluded, so the link never enters the repo.
- **Codex** gets a `## Skills` index appended to its generated bridge: each skill's name and description (from SKILL.md frontmatter, falling back to the directory name and first body line) plus the absolute path to read before doing that kind of task. Name/description in context, body on demand — same economy as Claude Code.

## The write-back protocol

A protocol file (`.writeback-protocol.md`) is loaded alongside the memory and tells the agent how to maintain it. The key idea, ported from Hermes, is that the instructions for maintaining memory travel *with* the memory surface itself. On Claude Code the protocol is `@import`ed by the CLAUDE.md bridge; on Codex it is concatenated into the generated bridge — either way it is in context every session. In summary:

- **When to save** — proactively, without being asked: a stated preference, correction, or personal detail goes to the shared USER.md; a stable fact about your environment, stack, or conventions goes to MEMORY.md. Priority when space is tight: user preferences and corrections, then environment facts, then procedures.
- **When to skip** — trivia, easily re-discovered facts, raw log dumps, task progress, completed-work logs, temporary debugging state, one-off paths. Reusable procedures become a skill, not a memory note.
- **Format** — one fact per bullet, present tense, absolute dates. Never write secrets or tokens.
- **When full** — consolidate rather than append: merge overlapping entries, drop the stalest, then add, all in one edit. A memory that only ever grows becomes bloated and gets ignored.

The agent makes these edits with the ordinary file tools its CLI already has. There is no custom memory tool to learn or configure.

## The reflection loop

Before an agent finishes a session, a session-end reflection prompts it to review the conversation and update its memory and skills so the next session starts smarter — durable facts and preferences into USER.md / MEMORY.md, and any correction to its style or workflow embedded into the skill that governs that class of task. The reflection is deliberately active: a review that changes nothing is usually a missed learning opportunity.

It also carries an explicit do-not-capture list, because some things harden into false constraints if remembered: environment-dependent failures (a missing binary, an unconfigured credential), negative claims about tools ("X is broken" — capture the fix instead), transient errors that resolved on retry, and one-off task narratives.

**On the Claude Code runtime the reflection is enforced** by a native Stop hook (`.claude/reflect-on-stop.mjs`, generated): when the agent tries to finish, the hook feeds the reflection prompt back for exactly one review turn (guarded by `stop_hook_active` so it never loops), then the agent stops. The hook adds three refinements:

- **Trivial-session skip** — if the session transcript is under 16 KB, there is nothing durable to reflect on and the hook lets the agent stop immediately (absent/unreadable transcript info fails open into a normal reflection).
- **Concurrency lock** — the hook takes `<agent-memory>/.reflect.lock` before injecting the reflection and releases it on the post-reflection stop, so two concurrent sessions of the same agent never reflect (and edit the same memory files) simultaneously. A stale lock (older than 10 minutes, e.g. from a crashed session) is overwritten.
- **Budget enforcement** — the hook stats MEMORY.md (target 2,200 chars) and the shared USER.md (target 1,375 chars); any file over target gets an explicit consolidate-before-adding note appended to the reflection prompt.

**On Codex the reflection is convention-driven** — Codex has no stop-hook mechanism, so the generated bridge carries the protocol's session-end reflection text plus a standing final instruction: *"Before you consider a task complete, run the session-end reflection above and update MEMORY.md / the shared USER.md / skills if anything durable was learned."* Best-effort by construction; Claude Code is the enforced path.

## How memory reaches each runtime

The canonical files are the same for every runtime; each CLI is pointed at them by a small generated bridge. (An OpenCode runtime existed in an earlier iteration and has been removed.)

| Runtime | Bridge | Mechanism | Native write-back |
|---|---|---|---|
| Claude Code | `CLAUDE.md` + `.claude/settings.json` + `.claude/skills` symlink | `@import` for AGENT.md, the shared USER.md, and the write-back protocol; native auto-memory for MEMORY.md; skills via the symlink | Yes (Stop-hook-enforced reflection) |
| Codex | `.codex/AGENTS.md` | Concatenated text (AGENT.md + shared USER.md + MEMORY.md + protocol + skills index), regenerated on each launch (Codex can't import) | Driven by the protocol (convention) |

Claude Code references the live canonical files, so it needs no rebuild. Codex has no import syntax, so its bridge is a concatenation of the memory files regenerated from the canonical source every time a Codex session launches. Either way, the agent always edits the canonical files — the bridges are derived, never hand-edited.

Bridge and canonical files are seeded write-if-**missing**: re-running the scaffold (e.g. the launch-time backfill) never overwrites a file that exists — including one you deliberately emptied.

## Where to see it

The **Agent Files** panel in an agent's workspace lists this whole surface — the Memory files (including the shared profile, labeled "USER.md (shared)"), the Skills, and the worktree bridge — and only shows files that exist, so it visibly grows as the agent learns. Click any file to open it in a viewer tab.
