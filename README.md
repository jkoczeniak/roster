# Roster

An agentic development environment for macOS. Roster is a local-first, single-user desktop app where you build a roster of persistent coding agents and work alongside them in the terminal. Every agent is a durable identity — its own name, photo, git repository, runtime CLI, and long-lived memory — not a throwaway chat session. You come back to the same agent tomorrow and it remembers what it learned today.

The interface is a two-level left rail. **Teams** group your work (a name and a square photo); inside each team live **Agents** (a name and a circular photo). Selecting an agent opens its workspace: a strip of **session** tabs, each a real terminal running the agent's coding CLI inside that agent's own git worktree. A **model bar** under the tabs lets you spawn a session on a different model without leaving the agent. On the right, the **Agent Files** panel shows the agent's memory growing as it works.

Roster runs two CLI coding agents you install yourself: **Claude Code** and **OpenAI Codex**. Nothing here is a hosted service — no accounts, no telemetry, no cloud. Your code, your CLIs' own logins, and your agents' memory all stay on your machine. The in-app terminal is [Ghostty](https://github.com/ghostty-org/ghostty)'s own terminal core, compiled to WebAssembly.

> Roster is a personal, local-only rebuild of [ADE](https://github.com/per-simmons/damon-ade) (itself derived from [Superset](https://github.com/superset-sh/superset)), stripped to Claude Code + Codex, moved onto a Ghostty terminal, and hardened for security. See [NOTICE](NOTICE) for the full modification list. Distributed under the Elastic License 2.0.

## Screenshots

<!-- TODO: rail with teams + agents -->
<!-- TODO: agent workspace with session tabs + model bar -->
<!-- TODO: Agent Files panel showing memory -->

## Install

### Build from source

Requires [Bun](https://bun.sh) 1.0+ and macOS.

```bash
git clone https://github.com/jkoczeniak/roster.git
cd roster
bun install
cd apps/desktop
bun run compile:app        # builds main + preload + renderer into dist/
bunx electron .            # launches the built app
```

`compile:app` runs the full production build; `bunx electron .` then launches it directly. (Avoid `electron-vite preview` for a full run — it can exhaust memory.)

### Download

Signed DMGs, when published, are on the [releases page](https://github.com/jkoczeniak/roster/releases). macOS only.

## Prerequisites

Roster orchestrates coding CLIs; it does not bundle them. You need:

- **Git** — required. Each agent gets its own repository or worktree. Install Apple's command line tools with `xcode-select --install`.
- **At least one agent CLI:**

  ```bash
  npm i -g @anthropic-ai/claude-code   # Claude Code (default runtime)
  npm i -g @openai/codex               # OpenAI Codex
  ```

  Each CLI authenticates through its own login (your Anthropic and ChatGPT/OpenAI accounts). Roster stores no API keys.
- **Node.js** — only as the vehicle for installing the CLIs above via `npm`. Roster itself does not need a separate Node runtime.
- **Ghostty** (optional) — install [Ghostty.app](https://ghostty.org) if you want the **Open in Ghostty** action (opens an agent's worktree in a native Ghostty window). The in-app terminal already runs Ghostty's core and needs no separate install.

## Walkthrough

**1. First launch.** Roster opens on a start screen with a single action: **Create a team**. There are no agents until a team exists, so start here.

**2. Create a team.** Give it a name (for example, `Newsletter`). Optionally click the square photo thumbnail to pick an image — teams are the top level of the rail, so a photo makes them easy to find at a glance. The team appears in the left rail.

**3. Create an agent.** Hover the team's header in the rail and click the **+** button ("New agent"). In the New Agent dialog:
   - **Name** — required (for example, `Scout`).
   - **Role** — optional. A sentence describing what this agent is for. Leave it blank if you'd rather shape the agent by talking to it — Roster seeds the agent's identity file either way, and it refines itself over time.
   - **Runtime** — the coding CLI this agent runs: **Claude** or **Codex**. Claude is the default.
   - **Repository** — pick how the agent's workspace is set up:
     - **New empty repo** — a fresh git repo (`git init`).
     - **Folder (no git)** — just a plain folder on your Mac, no version control. The agent still gets all the same things — its own rules, memory, skills, sessions, and model switching. Choose this if you don't use git/GitHub and just want an agent to work with.
     - **Clone from URL** / **Clone from local path** — for an existing repo.

   Roster creates the agent, gives it its own workspace, and scaffolds its memory in the background. Git is only required for the repo/clone options — a **Folder** agent needs no git at all.

**4. Add profile photos.** Right-click any agent in the rail and choose **Change Photo** (or **Remove Photo**) to give it a circular avatar. Team photos are set the same way from the team's header menu. Photos are optional but make a busy rail readable.

**5. Sessions start automatically.** Opening an agent that has no sessions yet automatically spawns one — a terminal tab running the agent's runtime CLI in its worktree. That's the agent, live. Open more session tabs whenever you want parallel threads of work.

**6. Switch models from the model bar.** Below the session tabs is a quiet row of model variants: **Claude** (default), **Fable**, **Opus**, **Sonnet** for the Claude runtime, and **High** / **Medium** reasoning for Codex (GPT-5.5). Click any to open a new session in the current agent's worktree running that model — the same code, a different model, no context switch.

**7. Choose your autonomy.** Sessions launch in **Guarded** mode by default — each CLI keeps its own approval prompts and sandbox. If you fully trust a repo, switch to **Full autonomy** in Settings → Features to launch new sessions with the CLI's skip-permissions / full-access flags.

**8. Watch the memory grow.** The **Agent Files** panel on the right lists the agent's memory surface, grouped into **Memory**, **Skills**, and **Worktree**. It starts nearly empty and fills in as the agent learns — its identity, your shared profile, its notes, and any skills it writes for itself. Click a file to open it in a viewer tab.

## How memory works

Every Roster agent keeps a persistent, self-curated memory, adapted from the [Hermes agent](https://github.com/NousResearch/hermes-agent). The design is deliberately simple: plain markdown files the agent reads at the start of every session and writes back to as it learns. The files live outside the git worktree, so they survive branch and worktree churn and are never committed to your code.

Each agent's memory is a small set of files:

- **AGENT.md** — a short identity and operating brief (who the agent is, its role, its standing preferences).
- **USER.md** — a profile of you: name, preferences, communication style, hard rules. It is **shared across all your agents**, so a preference learned in one agent benefits every agent.
- **MEMORY.md** — the agent's own notes: project conventions, tool quirks, lessons learned, plus an index into any longer topic files.
- **Skills** — reusable, multi-step procedures the agent writes for itself, each a `SKILL.md` whose body loads only when relevant. Roster links each agent's skills into its worktree so the runtime actually discovers and loads them.

A write-back protocol travels with the memory, telling the agent when to save (a stated preference, a correction, a durable fact), when to skip (trivia, one-off state, anything easily re-discovered), and to consolidate rather than endlessly append. A session-end reflection loop prompts the agent to review the conversation and update its memory and skills before it finishes, so the next session starts smarter. On Claude Code this reflection is enforced by a native stop hook (with a trivial-session skip, a concurrency lock, and size-budget nudges); on Codex it runs by convention at session boundaries.

The same canonical files feed both runtimes through thin, auto-generated bridge files — a `CLAUDE.md` for Claude Code, a regenerated `.codex/AGENTS.md` for Codex — so you can switch an agent's runtime without losing its memory. See [docs/memory.md](docs/memory.md) for the full design.

## Security

Roster runs untrusted code by design (agents, cloned repos, a built-in browser). See [SECURITY.md](SECURITY.md) for the trust model, what's hardened, and the known residual risks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Roster is a modified derivative of [ADE](https://github.com/per-simmons/damon-ade), itself a derivative of [Superset](https://github.com/superset-sh/superset) (Copyright Superset, Inc.), distributed under the **Elastic License 2.0** — see [LICENSE.md](LICENSE.md) and [NOTICE](NOTICE). Third-party dependency notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The agent memory architecture is adapted from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (MIT).
