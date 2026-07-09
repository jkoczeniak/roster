import { workspaces, worktrees } from "@roster/local-db";
import { TRPCError } from "@trpc/server";
import { getAgentWorktreePath } from "main/lib/agent-home";
import { beginAgentInit } from "main/lib/agent-init";
import { createAgentSkill } from "main/lib/agent-scaffold";
import { localDb } from "main/lib/local-db";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	activateProject,
	getMaxWorkspaceTabOrder,
	getProject,
	getWorkspace,
	setLastActiveWorkspace,
} from "../utils/db-helpers";
import { createAgentInput } from "./create-agent-input";

/**
 * Roster: create an Agent (a `workspaces` row) with its OWN standalone git repo.
 *
 * Unlike the shared-repo `create` procedure (`git worktree add` off the
 * project's mainRepoPath), an Agent owns a repo at <agent-home>/worktree. The
 * DB rows are inserted immediately with a null gitStatus, then a BACKGROUND job
 * (beginAgentInit) builds the repo + memory scaffold and streams progress to
 * WorkspaceInitializingView — a slow clone must never block this call. The
 * Agent's Category is the `projectId`; project.mainRepoPath is not read.
 */
export const createAgentProcedures = () => {
	return router({
		createAgent: publicProcedure
			.input(createAgentInput)
			.mutation(({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					throw new Error(`Category ${input.projectId} not found`);
				}

				const agentId = uuidv4();
				const worktreePath = getAgentWorktreePath(agentId);
				// Placeholder branch; the init job resolves the real branch (a
				// clone may not be on "main") and updates these rows.
				const branch = "main";

				// gitStatus is null until the init job completes, so the content
				// view shows the checklist (see workspace/$workspaceId/page.tsx
				// hasIncompleteInit) rather than a broken terminal.
				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: worktreePath,
						branch,
						baseBranch: branch,
						gitStatus: null,
					})
					.returning()
					.get();

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
				const workspace = localDb
					.insert(workspaces)
					.values({
						id: agentId,
						projectId: input.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch,
						name: input.name,
						runtime: input.runtime,
						isUnnamed: false,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				activateProject(project);
				setLastActiveWorkspace(agentId);

				// Build the repo + memory scaffold in the background.
				beginAgentInit(agentId, {
					categoryId: input.projectId,
					worktreeId: worktree.id,
					agentName: input.name,
					role: input.role,
					runtime: input.runtime,
					source: input.repo,
				});

				return {
					workspace,
					worktreePath,
					worktreeId: worktree.id,
					isInitializing: true,
				};
			}),

		/**
		 * Scaffold a new skill for an agent from the authoring template (the
		 * Agent panel's "New skill" action). Returns the SKILL.md path so the
		 * UI can open it in a viewer tab for editing.
		 */
		createSkill: publicProcedure
			.input(
				z.object({ workspaceId: z.string(), name: z.string().trim().min(1) }),
			)
			.mutation(({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Workspace ${input.workspaceId} not found`,
					});
				}
				try {
					const skillPath = createAgentSkill(input.workspaceId, input.name);
					return { skillPath };
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error ? error.message : "Failed to create skill",
					});
				}
			}),
	});
};
