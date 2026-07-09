import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckItem, GitHubStatus } from "@roster/local-db";
import { z } from "zod";
import { branchExistsOnRemote } from "../git";
import { execWithShellEnv } from "../shell-env";
import { sharesAncestry } from "./ancestry";
import { execErrorText, isCommandNotFound } from "./cli-error";
import { getOriginRemoteUrl, remoteUrlToWebUrl } from "./detection";
import {
	type Forge,
	ForgePRNotFoundError,
	ForgePRNotMergeableError,
} from "./types";

const execFileAsync = promisify(execFile);

// Zod schemas for `glab api` output validation (GitLab REST API shapes)
const GLMRSchema = z.object({
	iid: z.number(),
	title: z.string(),
	web_url: z.string(),
	state: z.enum(["opened", "closed", "locked", "merged"]),
	draft: z.boolean().optional(),
	work_in_progress: z.boolean().optional(), // pre-14.x field name for draft
	merged_at: z.string().nullable().optional(),
	sha: z.string().nullable().optional(),
});

type GLMR = z.infer<typeof GLMRSchema>;

const GLPipelineSchema = z.object({
	status: z.string(),
	web_url: z.string().optional(),
});

const GLMRDetailSchema = z.object({
	head_pipeline: GLPipelineSchema.nullable().optional(),
	pipeline: GLPipelineSchema.nullable().optional(), // deprecated alias
});

type GLPipeline = z.infer<typeof GLPipelineSchema>;

const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

/**
 * Fetches GitLab MR status for a worktree using the `glab` CLI, normalized to
 * the same GitHubStatus shape the GitHub path produces.
 * Uses `glab api` (stable across glab versions) rather than `glab mr view`
 * flags. Returns null if `glab` is missing, unauthenticated, or on error.
 */
export async function fetchGitLabMRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	const cached = cache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		const remoteUrl = await getOriginRemoteUrl(worktreePath);
		const repoUrl = remoteUrl ? remoteUrlToWebUrl(remoteUrl) : null;
		if (!repoUrl) {
			return null;
		}

		const { stdout: branchOutput } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const branchName = branchOutput.trim();

		const [branchCheck, mrInfo] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getMRForBranch(worktreePath, branchName),
		]);

		const result: GitHubStatus = {
			pr: mrInfo,
			repoUrl,
			branchExistsOnRemote: branchCheck.status === "exists",
			lastRefreshed: Date.now(),
			forge: "gitlab",
		};

		cache.set(worktreePath, { data: result, timestamp: Date.now() });

		return result;
	} catch {
		return null;
	}
}

/** Rank so an open MR wins over a merged/closed one for the same branch. */
const MR_STATE_RANK: Record<GLMR["state"], number> = {
	opened: 0,
	locked: 1,
	merged: 2,
	closed: 3,
};

async function getMRForBranch(
	worktreePath: string,
	branchName: string,
): Promise<GitHubStatus["pr"]> {
	try {
		// `glab api` replaces :id with the project ID resolved from the repo in cwd.
		const { stdout } = await execWithShellEnv(
			"glab",
			[
				"api",
				`projects/:id/merge_requests?source_branch=${encodeURIComponent(branchName)}&per_page=20`,
			],
			{ cwd: worktreePath, timeout: 30_000 },
		);

		const candidates = parseMRListResponse(stdout).sort(
			(a, b) => MR_STATE_RANK[a.state] - MR_STATE_RANK[b.state],
		);

		for (const candidate of candidates) {
			if (
				candidate.sha &&
				(await sharesAncestry(worktreePath, candidate.sha))
			) {
				return formatMRData(worktreePath, candidate);
			}
		}

		return null;
	} catch {
		return null;
	}
}

function parseMRListResponse(stdout: string): GLMR[] {
	const trimmed = stdout.trim();
	if (!trimmed || trimmed === "null") {
		return [];
	}

	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch (error) {
		console.warn(
			"[GitLab] Failed to parse MR list response JSON:",
			error instanceof Error ? error.message : String(error),
		);
		return [];
	}

	if (!Array.isArray(raw)) {
		return [];
	}

	const parsed: GLMR[] = [];
	for (const item of raw) {
		const result = GLMRSchema.safeParse(item);
		if (result.success) {
			parsed.push(result.data);
		} else {
			console.error("[GitLab] MR schema validation failed:", result.error);
		}
	}
	return parsed;
}

async function formatMRData(
	worktreePath: string,
	mr: GLMR,
): Promise<NonNullable<GitHubStatus["pr"]>> {
	const pipeline = await fetchHeadPipeline(worktreePath, mr.iid);
	const isDraft = mr.draft ?? mr.work_in_progress ?? false;

	return {
		number: mr.iid,
		title: mr.title,
		url: mr.web_url,
		state: mapMRState(mr.state, isDraft),
		mergedAt: mr.merged_at ? new Date(mr.merged_at).getTime() : undefined,
		// GitLab's MR REST API has no line-level diff stats (only changes_count,
		// a file count), so these read 0 for GitLab MRs.
		additions: 0,
		deletions: 0,
		// Approval rules are a paid GitLab feature with a separate endpoint;
		// report "pending" rather than guessing.
		reviewDecision: "pending",
		checksStatus: pipeline ? mapPipelineToOverall(pipeline.status) : "none",
		checks: pipeline ? [pipelineCheckItem(pipeline)] : [],
	};
}

function mapMRState(
	state: GLMR["state"],
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (state === "merged") return "merged";
	if (state === "closed") return "closed";
	if (isDraft) return "draft";
	return "open"; // opened, or locked (transient state while merging)
}

async function fetchHeadPipeline(
	worktreePath: string,
	iid: number,
): Promise<GLPipeline | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"glab",
			["api", `projects/:id/merge_requests/${iid}`],
			{ cwd: worktreePath, timeout: 30_000 },
		);
		const result = GLMRDetailSchema.safeParse(JSON.parse(stdout));
		if (!result.success) {
			return null;
		}
		return result.data.head_pipeline ?? result.data.pipeline ?? null;
	} catch {
		return null;
	}
}

function pipelineCheckItem(pipeline: GLPipeline): CheckItem {
	return {
		name: "Pipeline",
		status: mapPipelineToCheckStatus(pipeline.status),
		url: pipeline.web_url,
	};
}

function mapPipelineToCheckStatus(status: string): CheckItem["status"] {
	switch (status) {
		case "success":
			return "success";
		case "failed":
			return "failure";
		case "canceled":
		case "canceling":
			return "cancelled";
		case "skipped":
		case "manual":
			return "skipped";
		default:
			// created, waiting_for_resource, preparing, pending, running, scheduled
			return "pending";
	}
}

function mapPipelineToOverall(
	status: string,
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	switch (status) {
		case "success":
		case "skipped":
		case "manual":
			return "success";
		case "failed":
		case "canceled":
		case "canceling":
			return "failure";
		default:
			return "pending";
	}
}

function mapGitLabCliError(error: unknown): Error {
	if (isCommandNotFound(error)) {
		return new Error(
			"GitLab CLI (glab) is not installed. Please install it from https://gitlab.com/gitlab-org/cli",
		);
	}

	const text = execErrorText(error).toLowerCase();
	if (
		text.includes("glab auth login") ||
		text.includes("not logged in") ||
		text.includes("no token") ||
		text.includes("401") ||
		text.includes("unauthorized")
	) {
		return new Error(
			"Not logged in to GitLab CLI. Please run 'glab auth login' first.",
		);
	}
	if (
		text.includes("no open merge request") ||
		text.includes("404") ||
		text.includes("not found")
	) {
		return new ForgePRNotFoundError("No merge request found for this branch");
	}
	if (
		text.includes("405") ||
		text.includes("cannot be merged") ||
		text.includes("draft")
	) {
		return new ForgePRNotMergeableError(
			"Merge request cannot be merged. Check for conflicts, draft status, or required pipelines.",
		);
	}

	return error instanceof Error ? error : new Error(String(error));
}

/** First http(s) URL in CLI output, if any. */
function extractUrl(output: string): string | null {
	const match = output.match(/https?:\/\/\S+/);
	return match ? match[0] : null;
}

export const gitlabForge: Forge = {
	kind: "gitlab",
	displayName: "GitLab",
	cliName: "glab",
	prNoun: "merge request",
	prAbbrev: "MR",

	fetchPRStatus: fetchGitLabMRStatus,

	async createPR({ worktreePath, branch }) {
		try {
			const { stdout } = await execWithShellEnv(
				"glab",
				["mr", "create", "--web", "--fill", "--source-branch", branch],
				{ cwd: worktreePath, timeout: 60_000 },
			);
			const remoteUrl = await getOriginRemoteUrl(worktreePath);
			const fallback =
				(remoteUrl && remoteUrlToWebUrl(remoteUrl)) || "https://gitlab.com";
			return { url: extractUrl(stdout) ?? fallback };
		} catch (error) {
			throw mapGitLabCliError(error);
		}
	},

	async mergePR({ worktreePath, strategy }) {
		// GitLab has no per-merge rebase flag — fast-forward/rebase behavior is
		// the project's configured merge method — so only squash maps to a flag
		// and "rebase" falls through to the project default.
		const args = ["mr", "merge", "--yes"];
		if (strategy === "squash") {
			args.push("--squash");
		}

		try {
			await execWithShellEnv("glab", args, {
				cwd: worktreePath,
				timeout: 60_000,
			});
		} catch (error) {
			throw mapGitLabCliError(error);
		}
	},
};
