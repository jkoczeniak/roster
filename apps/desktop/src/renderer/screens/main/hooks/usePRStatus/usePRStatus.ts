import type { GitHubStatus } from "@roster/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UsePRStatusOptions {
	workspaceId: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
}

interface UsePRStatusResult {
	pr: GitHubStatus["pr"] | null;
	repoUrl: string | null;
	branchExistsOnRemote: boolean;
	/** Which forge hosts the repo — null while loading or for unknown hosts. */
	forge: GitHubStatus["forge"] | null;
	isLoading: boolean;
	refetch: () => void;
}

/**
 * Hook to fetch and manage PR/MR status for a workspace (GitHub or GitLab).
 * Returns PR info, loading state, and refetch function.
 */
export function usePRStatus({
	workspaceId,
	enabled = true,
	refetchInterval,
}: UsePRStatusOptions): UsePRStatusResult {
	const {
		data: githubStatus,
		isLoading,
		refetch,
	} = electronTrpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: enabled && !!workspaceId,
			refetchInterval,
		},
	);

	return {
		pr: githubStatus?.pr ?? null,
		repoUrl: githubStatus?.repoUrl ?? null,
		branchExistsOnRemote: githubStatus?.branchExistsOnRemote ?? false,
		forge: githubStatus?.forge ?? null,
		isLoading,
		refetch,
	};
}
