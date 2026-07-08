# Security

Roster is a single-user, local-first desktop app that deliberately runs code
you may not fully trust: coding-agent CLIs, repositories you clone, and web
pages in the built-in browser. This document describes the trust model, what
has been hardened, and the residual risks you should be aware of.

## Trust model

- **Single local user.** Roster assumes the machine's logged-in user is the
  owner. It is not multi-tenant and does not defend one local OS user against
  another beyond standard file permissions.
- **Agents are trusted within their own terminal.** An agent CLI running in a
  session tab is the agent acting on your behalf, in its own git worktree.
- **Repositories and web content are untrusted by default.** A cloned repo, a
  repo-supplied `.roster/config.json`, or a page in a browser pane may be
  hostile.

## What is hardened

- **Local hook/notification server** (loopback HTTP) requires a per-run secret
  token (`x-roster-token`, stored `0600`, constant-time compared) on every
  endpoint except `/health`, validates a loopback `Host` header (anti
  DNS-rebinding), and sends no permissive CORS header. Without this, any local
  process or web page could hit `/agent/invoke` and spawn agents.
- **No telemetry.** PostHog and Sentry, and all their call sites, were removed.
  Roster makes no analytics or error-reporting network calls.
- **Content Security Policy** is scoped to local operation — no cloud or
  telemetry origins, `object-src 'none'`.
- **Electron windows** run with `contextIsolation`, `sandbox`, and
  `nodeIntegration: false`. Attached `<webview>`s have their preload stripped
  and node integration forced off; the main window denies cross-origin
  navigation and window-open by default and routes external links through a
  validated `openExternal` (http/https/mailto only).
- **CDP remote-debugging port** is not opened in a packaged production build
  unless you set `ROSTER_ENABLE_CDP=1`. When enabled, its allowed origins are
  scoped to loopback (never `*`). It is on in development.
- **Git clone URLs** are validated before cloning: git remote-helper transports
  (`ext::`, `fd::`, `file::`) and option-injection (leading `-`, dashed
  scp-host) are rejected.
- **Workspace trust.** A repository's `.roster/config.json` `setup` and
  `teardown` commands do not run in a shell on open/delete for untrusted
  folders. The decision is enforced in the main process: setup commands reach a
  PTY only after you explicitly trust the folder (persisted to
  `~/.roster/trusted-roots.json`, `0600`), and teardown commands are skipped
  entirely for untrusted roots. Untrusted setup commands are shown to you in a
  dialog first.
- **Agent permission modes.** New sessions launch in **Guarded** mode (the
  CLI's own approval prompts and sandbox). **Full autonomy** (skip-permissions
  / full sandbox access) is opt-in per Settings → Features.

## Known residual risks

These are inherent to what the app does, and are within the single-user local
trust model:

- **The hook token is available inside agent terminals.** Any process in an
  agent's terminal can call `/agent/invoke` to launch another agent. This is
  how CLI hooks authenticate; the terminal is already the agent's trusted
  context. Non-terminal local processes and web content cannot reach it.
- **The `filesystem` and other privileged tRPC procedures are unconfined to a
  root.** They are only callable by the trusted renderer, not by web content,
  but a renderer compromise would inherit broad filesystem access.
- **Built-in browser panes share the app's session partition.** Storage is
  isolated per-origin, but a dedicated browser partition would be stronger.
- **`ROSTER_ENABLE_CDP=1`** re-opens an unauthenticated local debugging surface;
  only enable it if you understand that any local process could then attach.

## Reporting

This is a personal project. If you find a security issue, open an issue on the
repository (omit exploit details for anything sensitive and ask for a private
channel).
