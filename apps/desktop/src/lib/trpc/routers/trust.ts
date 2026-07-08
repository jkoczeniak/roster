import { isTrusted, trust } from "main/lib/workspace-trust";
import { z } from "zod";
import { publicProcedure, router } from "..";

/**
 * Workspace-trust router — exposes the persisted trusted-roots allow-list that
 * gates auto-running a repo's `.roster/config.json` setup commands.
 */
export const createTrustRouter = () => {
	return router({
		getTrust: publicProcedure
			.input(z.object({ root: z.string().min(1) }))
			.query(({ input }) => {
				return { root: input.root, trusted: isTrusted(input.root) };
			}),

		setTrust: publicProcedure
			.input(z.object({ root: z.string().min(1) }))
			.mutation(({ input }) => {
				trust(input.root);
				return { root: input.root, trusted: true };
			}),
	});
};
