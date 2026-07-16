import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	relative,
	resolve,
	sep,
} from "node:path";
import { projects, worktrees } from "@roster/local-db";
import { eq } from "drizzle-orm";
import { ROSTER_HOME_DIR } from "main/lib/app-environment";
import { localDb } from "main/lib/local-db";

/**
 * Security model for desktop app filesystem access:
 *
 * THREAT MODEL:
 * While a compromised renderer can execute commands via terminal panes,
 * the File Viewer presents a distinct threat: malicious repositories can
 * contain symlinks that trick users into reading/writing sensitive files
 * (e.g., `docs/config.yml` → `~/.bashrc`). Users clicking these links
 * don't know they're accessing files outside the repo.
 *
 * PRIMARY BOUNDARY: assertRegisteredWorktree()
 * - Only worktree paths registered in localDb are accessible via tRPC
 * - Prevents direct filesystem access to unregistered paths
 *
 * SECONDARY: validateRelativePath()
 * - Rejects absolute paths and ".." traversal segments
 * - Defense in depth against path manipulation
 *
 * SYMLINK PROTECTION (secure-fs.ts):
 * - Writes: Block if realpath escapes worktree (prevents accidental overwrites)
 * - Reads: Caller can check isSymlinkEscaping() to warn users
 */

/**
 * Security error codes for path validation failures.
 */
export type PathValidationErrorCode =
	| "ABSOLUTE_PATH"
	| "PATH_TRAVERSAL"
	| "UNREGISTERED_WORKTREE"
	| "NON_GIT_WORKTREE"
	| "INVALID_TARGET"
	| "SYMLINK_ESCAPE";

/**
 * Error thrown when path validation fails.
 * Includes a code for programmatic handling.
 */
export class PathValidationError extends Error {
	constructor(
		message: string,
		public readonly code: PathValidationErrorCode,
	) {
		super(message);
		this.name = "PathValidationError";
	}
}

/**
 * Validates that a workspace path is registered in localDb.
 * This is THE critical security boundary.
 *
 * Accepts:
 * - Worktree paths (from worktrees table)
 * - Project mainRepoPath (for branch workspaces that work on the main repo)
 *
 * @throws PathValidationError if path is not registered
 */
export function assertRegisteredWorktree(workspacePath: string): void {
	// Check worktrees table first (most common case)
	const worktreeExists = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, workspacePath))
		.get();

	if (worktreeExists) {
		return;
	}

	// Check projects.mainRepoPath for branch workspaces
	const projectExists = localDb
		.select()
		.from(projects)
		.where(eq(projects.mainRepoPath, workspacePath))
		.get();

	if (projectExists) {
		return;
	}

	throw new PathValidationError(
		"Workspace path not registered in database",
		"UNREGISTERED_WORKTREE",
	);
}

/**
 * Validates that a workspace path is registered AND version-controlled.
 * Guard every git/gh mutation with this: a "Folder (no git)" agent's worktree
 * row has vcs === "none", and running git there yields raw simple-git errors
 * (or worse, acts on an enclosing repo). Legacy rows with vcs = null are git.
 *
 * @throws PathValidationError if unregistered or a non-git folder workspace
 */
export function assertGitWorktree(workspacePath: string): void {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, workspacePath))
		.get();

	if (worktree) {
		if (worktree.vcs === "none") {
			throw new PathValidationError(
				"This agent works in a plain folder (no git); git operations are not available",
				"NON_GIT_WORKTREE",
			);
		}
		return;
	}

	// Branch workspaces operate on the project's main repo — always git.
	const projectExists = localDb
		.select()
		.from(projects)
		.where(eq(projects.mainRepoPath, workspacePath))
		.get();

	if (projectExists) {
		return;
	}

	throw new PathValidationError(
		"Workspace path not registered in database",
		"UNREGISTERED_WORKTREE",
	);
}

/**
 * Gets the worktree record if registered. Returns record for updates.
 * Only works for actual worktrees, not project mainRepoPath.
 *
 * @throws PathValidationError if worktree is not registered
 */
export function getRegisteredWorktree(
	worktreePath: string,
): typeof worktrees.$inferSelect {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.path, worktreePath))
		.get();

	if (!worktree) {
		throw new PathValidationError(
			"Worktree not registered in database",
			"UNREGISTERED_WORKTREE",
		);
	}

	return worktree;
}

/**
 * Options for path validation.
 */
export interface ValidatePathOptions {
	/**
	 * Allow empty/root path (resolves to worktree itself).
	 * Default: false (prevents accidental worktree deletion)
	 */
	allowRoot?: boolean;
}

/**
 * Validates a relative file path for safety.
 * Rejects absolute paths and path traversal attempts.
 *
 * @throws PathValidationError if path is invalid
 */
export function validateRelativePath(
	filePath: string,
	options: ValidatePathOptions = {},
): void {
	const { allowRoot = false } = options;

	// Reject absolute paths
	if (isAbsolute(filePath)) {
		throw new PathValidationError(
			"Absolute paths are not allowed",
			"ABSOLUTE_PATH",
		);
	}

	const normalized = normalize(filePath);
	const segments = normalized.split(sep);

	// Reject ".." as a path segment (allows "..foo" directories)
	if (segments.includes("..")) {
		throw new PathValidationError(
			"Path traversal not allowed",
			"PATH_TRAVERSAL",
		);
	}

	// Reject root path unless explicitly allowed
	if (!allowRoot && (normalized === "" || normalized === ".")) {
		throw new PathValidationError(
			"Cannot target worktree root",
			"INVALID_TARGET",
		);
	}
}

/**
 * Validates and resolves a path within a worktree. Sync, simple.
 *
 * @param worktreePath - The worktree base path
 * @param filePath - The relative file path to validate
 * @param options - Validation options
 * @returns The resolved full path
 * @throws PathValidationError if path is invalid
 */
export function resolvePathInWorktree(
	worktreePath: string,
	filePath: string,
	options: ValidatePathOptions = {},
): string {
	validateRelativePath(filePath, options);
	// Use resolve to handle any worktreePath (relative or absolute)
	return resolve(worktreePath, normalize(filePath));
}

/**
 * Validates a path for git commands. Lighter check that allows root.
 *
 * @throws PathValidationError if path is invalid
 */
export function assertValidGitPath(filePath: string): void {
	validateRelativePath(filePath, { allowRoot: true });
}

/**
 * Roots the filesystem router may touch: every registered worktree, every
 * project main repo + custom worktree base dir, the Roster home dir (agent
 * homes, icons, notes), and ~/.claude (session listings).
 */
export function getAllowedFilesystemRoots(): string[] {
	const roots = new Set<string>([
		resolve(ROSTER_HOME_DIR),
		resolve(join(homedir(), ".claude")),
	]);

	// Fail closed: if the DB read is unavailable, confinement tightens to the
	// static roots above rather than opening up.
	try {
		for (const row of localDb
			.select({ path: worktrees.path })
			.from(worktrees)
			.all()) {
			if (row.path) roots.add(resolve(row.path));
		}

		for (const row of localDb
			.select({
				mainRepoPath: projects.mainRepoPath,
				worktreeBaseDir: projects.worktreeBaseDir,
			})
			.from(projects)
			.all()) {
			if (row.mainRepoPath) roots.add(resolve(row.mainRepoPath));
			if (row.worktreeBaseDir) roots.add(resolve(row.worktreeBaseDir));
		}
	} catch (error) {
		console.warn(
			"[path-validation] Could not read worktree/project roots from DB:",
			error,
		);
	}

	return [...roots];
}

function isWithinRoot(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Confines an absolute path to the Roster-managed roots above. This is
 * defense-in-depth for the generic filesystem tRPC surface: even if a
 * renderer-side bug produces an attacker-influenced absolute path, the main
 * process refuses to read, write, or delete outside known roots.
 *
 * Both the literal resolved path and its realpath (macOS /tmp → /private/tmp
 * style aliasing) are checked against both forms of each root.
 *
 * @returns the resolved path on success
 * @throws PathValidationError if the path is outside every allowed root
 */
export function assertPathInAllowedRoot(targetPath: string): string {
	const resolved = resolve(targetPath);

	const candidates = new Set<string>([resolved]);
	try {
		candidates.add(realpathSync.native(resolved));
	} catch {
		// Target may not exist yet (createFile/createDirectory) — try resolving
		// the parent instead so symlinked parents still match.
		try {
			candidates.add(
				join(realpathSync.native(dirname(resolved)), basename(resolved)),
			);
		} catch {
			// Parent missing too; the literal form alone will be checked.
		}
	}

	const rootForms = new Set<string>();
	for (const root of getAllowedFilesystemRoots()) {
		rootForms.add(root);
		try {
			rootForms.add(realpathSync.native(root));
		} catch {
			// Root doesn't exist on disk (stale DB row) — literal form suffices.
		}
	}

	for (const candidate of candidates) {
		for (const root of rootForms) {
			if (isWithinRoot(root, candidate)) return resolved;
		}
	}

	throw new PathValidationError(
		`Path is outside Roster-managed roots: ${targetPath}`,
		"UNREGISTERED_WORKTREE",
	);
}
