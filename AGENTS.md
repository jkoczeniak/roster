# Roster Monorepo Guide

Guidelines for agents and developers working in this repository. Roster is a
local-first macOS Electron app for running a roster of persistent coding agents
(Claude Code + Codex). There is no cloud, no backend, and no database server —
everything runs on the user's machine.

## Structure

Bun + Turbo monorepo with:
- **Apps**:
  - `apps/desktop` - the Electron desktop application (the whole product)
- **Packages**:
  - `packages/ui` - Shared UI components (shadcn/ui + TailwindCSS v4).
    - Add components: `npx shadcn@latest add <component>` (run in `packages/ui/`)
  - `packages/shared` - Shared utilities, agent command/runtime definitions
  - `packages/local-db` - Local SQLite database (Drizzle + better-sqlite3)
  - `packages/scripts` - CLI tooling
- **Tooling**:
  - `tooling/typescript` - Shared TypeScript configs

The desktop app is split into `src/main` (Electron main process: terminal host,
agent scaffolding, tRPC routers, windows), `src/preload` (contextBridge),
`src/renderer` (React UI), `src/lib` (tRPC routers shared main/preload), and
`src/shared` (constants, themes, types).

## Tech Stack

- **Package Manager**: Bun (no npm/yarn/pnpm)
- **Build System**: Turborepo
- **Desktop**: Electron + electron-vite; React 19 + TanStack Router/Query
- **Local storage**: Drizzle ORM + SQLite (`packages/local-db`)
- **Terminal**: ghostty-web (default) with xterm.js fallback; PTYs via node-pty
- **UI**: React + TailwindCSS v4 + shadcn/ui + Radix
- **Code Quality**: Biome (formatting + linting at root)

## Common Commands

```bash
# From repo root
bun install
bun run typecheck          # Type check all packages
bun run lint               # Check for lint issues (no changes)
bun run lint:fix           # Fix auto-fixable lint issues
bun run format             # Format code only

# From apps/desktop
bun run typecheck
bun run test               # Bun test suite
bun run compile:app        # Full production build into dist/
bunx electron .            # Launch the built app
```

## Code Quality

**Biome runs at root level** (not per-package) for speed:
- `biome check --write --unsafe` = format + lint + organize imports + fix all auto-fixable issues
- `biome check` = check only (no changes)
- Use `bun run lint:fix` to fix all issues automatically

## Agent Rules
1. **Type safety** - avoid `any` unless necessary.
2. **Prefer `gh` CLI** - for git operations (PRs, issues, checkout), prefer the GitHub CLI (`gh`) over raw `git` where possible.
3. **A change isn't done until it type-checks and tests pass** - run `bun run typecheck` and `bun run test` in `apps/desktop` before considering work complete.
4. **Security-sensitive surfaces** - the local hook server (`src/main/lib/notifications`), git clone handling (`src/main/lib/agent-repo.ts`), workspace trust (`src/main/lib/workspace-trust.ts`), Electron webPreferences, and the CSP require review before changes. See [SECURITY.md](SECURITY.md).

## Local DB migrations

- Schema in `packages/local-db/src/schema/`.
- Create migrations by changing the Drizzle schema then running
  `bun run --cwd packages/local-db generate` (drizzle-kit).
- **Never manually edit files in `packages/local-db/drizzle/`** — `.sql`
  migrations, `meta/_journal.json`, and snapshots are auto-generated.

## Project Structure convention

One folder per component (`ComponentName/ComponentName.tsx` + `index.ts` barrel);
co-locate hooks/utils/constants/tests next to the code that uses them; promote a
shared child to the highest shared parent's `components/`. One component per file.

### Exception: shadcn/ui Components

`packages/ui/src/components/ui/` and `.../ai-elements/` contain shadcn/ui
components using **kebab-case single files** (e.g., `button.tsx`). This is
intentional — the shadcn CLI expects this format for updates via
`bunx shadcn@latest add`.
