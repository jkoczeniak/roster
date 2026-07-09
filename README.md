# Roster

A studio for building local agents, on macOS. Roster is a local-first, single-user desktop app where you create agents with a **persona**, a **long-lived memory**, **skills** they write for themselves, and **connectors** to the systems they work with — then sit alongside them in a real terminal. Every agent is a durable identity — its own name, photo, role, workspace, and accumulated knowledge — not a throwaway chat session. You come back to the same agent tomorrow and it remembers what it learned today.

Think of an agent as a skill with a personality and a learning loop: a ticket reviewer that knows your Jira conventions, a research assistant that remembers what you've already read, an ops runner that has written down every quirk of your setup. An agent works in a plain folder by default — no git, no repo, nothing developer-shaped required. Agents that work in a codebase can opt into git (init or clone) and get diffs, branches, and PRs; that's the minority case, and the UI stays out of the way otherwise.

The interface is a two-level left rail. **Teams** group your agents (a name and a square photo); inside each team live **Agents** (a name and a circular photo). Selecting an agent opens its workspace: a strip of **session** tabs, each a real terminal running the agent's CLI. A **model bar** under the tabs lets you spawn a session on a different model without leaving the agent. On the right, the agent's panel shows its **persona, memory, and skills** growing as it works, and the **connectors** wiring it to Jira, Confluence, Linear, Notion, or your company's internal MCP endpoints.

Roster runs two CLI agents you install yourself: **Claude Code** and **OpenAI Codex** — the terminal UI means you always have each CLI's newest features the day they ship. Nothing here is a hosted service — no accounts, no telemetry, no cloud. Your files, your CLIs' own logins, and your agents' memory all stay on your machine. The in-app terminal is [Ghostty](https://github.com/ghostty-org/ghostty)'s own terminal core, compiled to WebAssembly.

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

Roster orchestrates agent CLIs; it does not bundle them. You need:

- **Git** — only for agents that opt into version control (repo/clone options). A folder agent needs no git. Install Apple's command line tools with `xcode-select --install`.
- **At least one agent CLI:**

  ```bash
  npm i -g @anthropic-ai/claude-code   # Claude Code (default runtime)
  npm i -g @openai/codex               # OpenAI Codex
  ```

  Each CLI authenticates through its own login (your Anthropic and ChatGPT/OpenAI accounts). Roster stores no API keys. See [docs/authentication.md](docs/authentication.md) for exactly how agents inherit your logins (and the one env-var gotcha).
- **Node.js** — only as the vehicle for installing the CLIs above via `npm`. Roster itself does not need a separate Node runtime.
- **Ghostty** (optional) — install [Ghostty.app](https://ghostty.org) if you want the **Open in Ghostty** action (opens an agent's worktree in a native Ghostty window). The in-app terminal already runs Ghostty's core and needs no separate install.

## Walkthrough

**1. First launch.** Roster opens on a start screen with a single action: **Create a team**. There are no agents until a team exists, so start here.

**2. Create a team.** Give it a name (for example, `Newsletter`). Optionally click the square photo thumbnail to pick an image — teams are the top level of the rail, so a photo makes them easy to find at a glance. The team appears in the left rail.

**3. Create an agent.** Hover the team's header in the rail and click the **+** button ("New agent"). In the New Agent dialog:
   - **Name** — required (for example, `Scout`).
   - **Role** — optional. A sentence describing what this agent does (for example, *"Review the ticket queue each morning and draft updates"*). It seeds the agent's identity file, and the agent refines itself over time — you can also leave it blank and shape the agent by talking to it.
   - **Runtime** — the CLI this agent runs: **Claude** or **Codex**. Claude is the default.
   - **Workspace** — every agent gets its own plain folder for files, memory, and skills; that's the default and needs no git. Agents that work in a codebase can expand **"Working in a codebase? Use git version control…"** and pick a fresh repo (`git init`) or a clone (URL / local path) instead.

   Roster creates the agent, gives it its own workspace, and scaffolds its memory in the background.

**4. Add profile photos.** Right-click any agent in the rail and choose **Change Photo** (or **Remove Photo**) to give it a circular avatar. Team photos are set the same way from the team's header menu. Photos are optional but make a busy rail readable.

**5. Your agent introduces itself.** Opening a brand-new agent automatically starts its first session, and the agent speaks first — it introduces its role, lists the tools it has, suggests a few things it could do, and asks what to start with. Just type back. Open more session tabs whenever you want parallel threads of work.

**6. Switch models from the model bar.** Below the session tabs is a quiet row of model variants: **Claude** (default), **Fable**, **Opus**, **Sonnet** for the Claude runtime, and **High** / **Medium** reasoning for Codex (GPT-5.5). Click any to open a new session in the current agent's workspace running that model — the same code, a different model, no context switch.

**7. Connect its tools.** Open the right sidebar's **Connectors** tab to wire the agent to the systems it works with — one click for Jira & Confluence, Linear, Notion, Sentry, and friends, or a custom entry for a company-internal MCP endpoint (a ServiceNow bridge, an O365 gateway) or a local command. Connectors are per-agent: the ticket reviewer gets Jira, the finance agent gets Stripe, and neither can touch the other's tools. Each connector you add is also recorded in the agent's persona (AGENT.md → **Tools**) with a note on what it's for, so the agent explicitly knows which tools its tasks require — edit those notes to sharpen when it reaches for each one. Remote connectors sign in from the agent's own session (`/mcp` in Claude Code) — Roster never stores credentials.

**8. Choose your autonomy.** Sessions launch in **Guarded** mode by default — each CLI keeps its own approval prompts and sandbox. If you fully trust an agent's workspace, switch it to **Full autonomy** from the model bar (or change the default in Settings → Features).

**9. Watch the memory grow.** The **Agent** panel on the right lists the agent's identity surface, grouped into **Memory**, **Skills**, and **Bridge files**. It starts nearly empty and fills in as the agent learns — its persona, your shared profile, its notes, and any skills it writes for itself. Click a file to read or edit it, or hit **New skill** to scaffold a procedure for the agent to follow.

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
