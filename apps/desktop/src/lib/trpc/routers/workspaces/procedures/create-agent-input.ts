import { AGENT_RUNTIMES } from "@roster/local-db/schema/zod";
import { assertSafeCloneUrl } from "main/lib/agent-repo";
import { z } from "zod";

/**
 * Input schema for the createAgent procedure. Kept in its own module so the
 * validation — notably the optional `role` field and the clone-URL guard — is
 * unit-testable in isolation. The clone-URL `.refine` reuses the same
 * `assertSafeCloneUrl` guard applied in agent-repo right before the clone, so
 * dangerous transports (ext::, leading `-`, …) are rejected at the API boundary
 * too rather than only deep in the init job.
 */
export const createAgentInput = z.object({
	projectId: z.string(),
	name: z.string().min(1),
	// Optional free-text identity captured at creation. Trimmed; empty becomes
	// undefined so the scaffold treats it as unset.
	role: z
		.string()
		.trim()
		.max(280)
		.optional()
		.transform((v) => (v ? v : undefined)),
	runtime: z.enum(AGENT_RUNTIMES).default("claude"),
	repo: z
		.discriminatedUnion("type", [
			z.object({ type: z.literal("init") }),
			z.object({ type: z.literal("folder") }),
			z.object({
				type: z.literal("clone"),
				url: z
					.string()
					.min(1)
					.refine(
						(url) => {
							try {
								assertSafeCloneUrl(url);
								return true;
							} catch {
								return false;
							}
						},
						{ message: "Unsafe or unsupported clone URL" },
					),
			}),
		])
		// Folder is the default workspace: most agents are personas working with
		// connectors and local files, not codebases. Git is the opt-in minority.
		.default({ type: "folder" }),
});
