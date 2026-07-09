import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Returns true if local HEAD and the given commit share ancestry
 * (one is an ancestor of the other, or they are the same commit).
 */
export async function sharesAncestry(
	worktreePath: string,
	prHeadOid: string,
): Promise<boolean> {
	try {
		const { stdout: localHead } = await execFileAsync(
			"git",
			["-C", worktreePath, "rev-parse", "HEAD"],
			{ timeout: 10_000 },
		);
		const localOid = localHead.trim();

		if (localOid === prHeadOid) {
			return true;
		}

		for (const [ancestor, descendant] of [
			[prHeadOid, localOid],
			[localOid, prHeadOid],
		]) {
			try {
				await execFileAsync(
					"git",
					[
						"-C",
						worktreePath,
						"merge-base",
						"--is-ancestor",
						ancestor,
						descendant,
					],
					{ timeout: 10_000 },
				);
				return true;
			} catch {
				// Try the other direction.
			}
		}

		return false;
	} catch {
		return false;
	}
}
