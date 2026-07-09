/**
 * Full text of a child-process error: execFile errors carry the interesting
 * part (CLI output) in `stderr`, not just `message`.
 */
export function execErrorText(error: unknown): string {
	if (error && typeof error === "object") {
		const e = error as { message?: string; stderr?: string };
		return [e.message, e.stderr].filter(Boolean).join("\n");
	}
	return String(error);
}

/** True when the error means the binary itself wasn't found on PATH. */
export function isCommandNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
