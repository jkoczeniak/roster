import { getForgeKindForPath } from "./detection";
import { githubForge } from "./github-forge";
import { gitlabForge } from "./gitlab-forge";
import type { Forge } from "./types";

export {
	clearForgeKindCache,
	detectForgeKind,
	getForgeKindForPath,
	getOriginRemoteUrl,
	parseRemoteHost,
	remoteUrlToWebUrl,
} from "./detection";
export type { Forge, ForgeKind, MergeStrategy } from "./types";
export { ForgePRNotFoundError, ForgePRNotMergeableError } from "./types";

/**
 * Resolves the forge (GitHub/GitLab) for a worktree from its origin remote.
 * Returns null for unknown hosts (Bitbucket, bare git servers, no remote) so
 * callers can hide PR affordances instead of erroring — the same graceful
 * degradation folder agents use for missing VCS.
 */
export async function getForgeForPath(
	worktreePath: string,
): Promise<Forge | null> {
	const kind = await getForgeKindForPath(worktreePath);
	if (kind === "github") return githubForge;
	if (kind === "gitlab") return gitlabForge;
	return null;
}
