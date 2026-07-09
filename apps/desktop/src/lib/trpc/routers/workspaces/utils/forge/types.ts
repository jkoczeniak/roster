import type { GitHubStatus } from "@roster/local-db";

export type ForgeKind = "github" | "gitlab";

export type MergeStrategy = "merge" | "squash" | "rebase";

/** Thrown when no PR/MR exists for the branch being merged. */
export class ForgePRNotFoundError extends Error {}

/** Thrown when the PR/MR exists but the forge refuses to merge it. */
export class ForgePRNotMergeableError extends Error {}

/**
 * A code forge (GitHub, GitLab) that hosts the repo's origin remote and
 * provides pull/merge-request operations via its CLI. Plain-git operations
 * (push, pull, fetch) stay host-agnostic and never go through a Forge.
 */
export interface Forge {
	kind: ForgeKind;
	/** Human-visible name, e.g. "GitHub". */
	displayName: string;
	/** CLI binary this forge shells out to, e.g. "gh" or "glab". */
	cliName: string;
	/** What the forge calls a pull request, e.g. "merge request". */
	prNoun: string;
	/** Short form of prNoun, e.g. "PR" or "MR". */
	prAbbrev: string;
	/**
	 * Fetches PR/MR status for the worktree's current branch, normalized to
	 * the GitHubStatus shape stored on the worktree row. Returns null if the
	 * CLI is missing, unauthenticated, or the lookup fails.
	 */
	fetchPRStatus(worktreePath: string): Promise<GitHubStatus | null>;
	/** Opens the forge's PR/MR creation page for the given branch. */
	createPR(opts: {
		worktreePath: string;
		branch: string;
	}): Promise<{ url: string }>;
	/** Merges the PR/MR for the worktree's current branch. */
	mergePR(opts: {
		worktreePath: string;
		strategy: MergeStrategy;
	}): Promise<void>;
}
