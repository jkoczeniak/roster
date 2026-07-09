import { fetchGitHubPRStatus } from "../github";
import { execWithShellEnv } from "../shell-env";
import { execErrorText, isCommandNotFound } from "./cli-error";
import {
	type Forge,
	ForgePRNotFoundError,
	ForgePRNotMergeableError,
} from "./types";

function mapGitHubCliError(error: unknown): Error {
	if (isCommandNotFound(error)) {
		return new Error(
			"GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/",
		);
	}

	const text = execErrorText(error).toLowerCase();
	if (text.includes("not logged in") || text.includes("gh auth login")) {
		return new Error(
			"Not logged in to GitHub CLI. Please run 'gh auth login' first.",
		);
	}
	if (text.includes("no pull requests found")) {
		return new ForgePRNotFoundError("No pull request found for this branch");
	}
	if (text.includes("not mergeable") || text.includes("blocked")) {
		return new ForgePRNotMergeableError(
			"PR cannot be merged. Check for merge conflicts or required status checks.",
		);
	}

	return error instanceof Error ? error : new Error(String(error));
}

export const githubForge: Forge = {
	kind: "github",
	displayName: "GitHub",
	cliName: "gh",
	prNoun: "pull request",
	prAbbrev: "PR",

	fetchPRStatus: fetchGitHubPRStatus,

	async createPR({ worktreePath, branch }) {
		try {
			const { stdout } = await execWithShellEnv(
				"gh",
				["pr", "create", "--web", "--fill", "--head", branch],
				{ cwd: worktreePath },
			);
			return { url: stdout.trim() || "https://github.com" };
		} catch (error) {
			throw mapGitHubCliError(error);
		}
	},

	async mergePR({ worktreePath, strategy }) {
		try {
			await execWithShellEnv("gh", ["pr", "merge", `--${strategy}`], {
				cwd: worktreePath,
			});
		} catch (error) {
			throw mapGitHubCliError(error);
		}
	},
};
