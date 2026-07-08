# How authentication works in Roster

**Roster itself has no accounts and stores no credentials.** It is a launcher:
all real authentication belongs to the CLIs it runs — Claude Code, Codex, and
`git`/`gh` — which read their own credentials from your machine. If you can run
`claude`, `codex`, or `gh` in Terminal.app, agents in Roster are signed in the
same way, as the same person.

## The mechanics

Every agent session is a real PTY running a **login shell** that re-sources
your own dotfiles (`~/.zshrc` / `~/.zprofile` / `~/.zshenv` via wrapper
dotfiles — see `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`). The
agent CLI is then launched inside that shell, so it sees your normal `PATH`,
`HOME`, and anything you export in your shell rc.

Per runtime:

- **Claude Code** — every agent shares your global `~/.claude` login (and the
  macOS-Keychain-stored OAuth credential). There is no per-agent isolation of
  the Claude login: all agents act as the same Claude account.
- **Codex** — each agent gets its own isolated `CODEX_HOME` (config, history),
  but its `auth.json` is a symlink to the global `~/.codex/auth.json`
  (`apps/desktop/src/main/lib/terminal/env.ts`, `linkSharedCodexAuth`). One
  `codex login` anywhere signs in every agent.
- **git / GitHub** — fully delegated. Inside agent terminals, `git` and `gh`
  use your shell's ssh agent (`SSH_AUTH_SOCK` is forwarded) and `gh`'s own
  stored token. Roster's own PR-status features shell out to `gh` the same way;
  if you see "Not logged in to GitHub CLI", run `gh auth login` once in any
  terminal.

## Environment variables: the one gotcha

Roster builds each terminal's environment from an **allowlist**
(`apps/desktop/src/main/lib/terminal/env.ts`) — it does not pass your whole
desktop environment through. `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are NOT
on that allowlist, so:

- Key exported in **`~/.zshrc`** (or another sourced rc file) → agents **see
  it** (the login shell re-sources your rc after the filter).
- Key set only in the **GUI/launchd environment** or the shell you launched
  Roster from → agents **do not see it**.

If Claude Code behaves as API-key-billed in Terminal.app but
subscription-billed inside Roster (or vice versa), this asymmetry is why.

## What Roster's own "secrets" are

Two local tokens exist, and neither is an identity:

- the **local hook server token** (`src/main/lib/notifications/token.ts`) —
  authenticates the CLIs' notification hooks back to the app on localhost;
- **workspace trust** (`src/main/lib/workspace-trust.ts`) — gates repo-supplied
  setup/teardown commands.

## Checking your auth state

There is currently no in-app indicator of which accounts your agents use. To
check, open any agent terminal and run:

```bash
claude /status     # or: claude auth status in newer CLIs
codex login status
gh auth status
```
