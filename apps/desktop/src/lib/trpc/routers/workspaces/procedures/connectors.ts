import { TRPCError } from "@trpc/server";
import {
	addConnector,
	isValidConnectorName,
	listConnectors,
	removeConnector,
} from "main/lib/agent-connectors";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getWorkspace } from "../utils/db-helpers";
import { getWorkspacePath } from "../utils/worktree";

/**
 * Per-agent connectors (MCP servers) — list/add/remove entries in the agent's
 * <worktree>/.mcp.json (and, for Codex agents, the mirrored CODEX_HOME config;
 * see main/lib/agent-connectors.ts). No credentials pass through here: remote
 * connectors authenticate in-session via the CLI's own OAuth flow.
 */

const connectorName = z.string().refine(isValidConnectorName, {
	message: "Connector names use letters, numbers, dashes, and underscores",
});

const remoteUrl = z
	.string()
	.url()
	.refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
		message: "Connector URLs must be http(s)",
	});

const addConnectorInput = z
	.object({
		workspaceId: z.string(),
		name: connectorName,
		type: z.enum(["http", "sse", "stdio"]),
		url: remoteUrl.optional(),
		command: z.string().min(1).optional(),
		args: z.array(z.string()).optional(),
		headers: z.record(z.string(), z.string()).optional(),
		env: z.record(z.string(), z.string()).optional(),
	})
	.refine((v) => (v.type === "stdio" ? !!v.command : !!v.url), {
		message:
			"Remote connectors need a URL; local (stdio) connectors need a command",
	});

function assertAgent(workspaceId: string) {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${workspaceId} not found`,
		});
	}
	// Legacy/branch workspaces don't live at the derived <agent-home>/worktree,
	// so resolve the real path from the DB and thread it through.
	return { workspace, worktreePath: getWorkspacePath(workspace) ?? undefined };
}

export const createConnectorProcedures = () => {
	return router({
		listConnectors: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const { workspace, worktreePath } = assertAgent(input.workspaceId);
				try {
					return {
						connectors: listConnectors(input.workspaceId, worktreePath),
						runtime: workspace.runtime,
						error: null as string | null,
					};
				} catch (error) {
					// A hand-corrupted .mcp.json shouldn't nuke the panel — surface it.
					return {
						connectors: [],
						runtime: workspace.runtime,
						error:
							error instanceof Error
								? error.message
								: "Could not read .mcp.json",
					};
				}
			}),

		addConnector: publicProcedure
			.input(addConnectorInput)
			.mutation(({ input }) => {
				const { worktreePath } = assertAgent(input.workspaceId);
				const { workspaceId, ...entry } = input;
				try {
					addConnector(workspaceId, entry, worktreePath);
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to add connector",
					});
				}
				return { ok: true };
			}),

		removeConnector: publicProcedure
			.input(z.object({ workspaceId: z.string(), name: z.string() }))
			.mutation(({ input }) => {
				const { worktreePath } = assertAgent(input.workspaceId);
				try {
					removeConnector(input.workspaceId, input.name, worktreePath);
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to remove connector",
					});
				}
				return { ok: true };
			}),
	});
};
