import { describe, expect, it } from "bun:test";
import {
	parseClaudeAuthStatus,
	parseCodexLoginStatus,
	parseGhAuthStatus,
} from "./cli-auth-status";

function probe(
	overrides: Partial<{
		stdout: string;
		stderr: string;
		failed: boolean;
		notInstalled: boolean;
	}>,
) {
	return {
		stdout: "",
		stderr: "",
		failed: false,
		notInstalled: false,
		...overrides,
	};
}

describe("parseClaudeAuthStatus", () => {
	it("reports authenticated with email and method from JSON output", () => {
		const result = parseClaudeAuthStatus(
			probe({
				stdout: JSON.stringify({
					loggedIn: true,
					authMethod: "claude.ai",
					apiProvider: "firstParty",
					email: "user@example.com",
					subscriptionType: "max",
				}),
			}),
		);
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("user@example.com · claude.ai (max)");
	});

	it("reports authenticated without optional fields", () => {
		const result = parseClaudeAuthStatus(
			probe({ stdout: JSON.stringify({ loggedIn: true }) }),
		);
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBeNull();
	});

	it("reports unauthenticated when loggedIn is false", () => {
		const result = parseClaudeAuthStatus(
			probe({ stdout: JSON.stringify({ loggedIn: false }), failed: true }),
		);
		expect(result.state).toBe("unauthenticated");
	});

	it("reports not_installed on ENOENT", () => {
		const result = parseClaudeAuthStatus(probe({ notInstalled: true }));
		expect(result.state).toBe("not_installed");
	});

	it("reports unknown when the CLI has no auth subcommand", () => {
		const result = parseClaudeAuthStatus(
			probe({ stderr: "error: unknown command 'auth'", failed: true }),
		);
		expect(result.state).toBe("unknown");
		expect(result.detail).toContain("can't report login status");
	});

	it("never includes raw output in the detail", () => {
		const result = parseClaudeAuthStatus(
			probe({
				stdout: JSON.stringify({
					loggedIn: true,
					email: "user@example.com",
					accessToken: "sk-ant-secret",
				}),
			}),
		);
		expect(result.detail ?? "").not.toContain("sk-ant-secret");
	});
});

describe("parseCodexLoginStatus", () => {
	it("reports authenticated via ChatGPT", () => {
		const result = parseCodexLoginStatus(
			probe({ stdout: "Logged in using ChatGPT\n" }),
		);
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("via ChatGPT");
	});

	it("reports authenticated via API key without the article", () => {
		const result = parseCodexLoginStatus(
			probe({ stdout: "Logged in using an API key\n" }),
		);
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("via API key");
	});

	it("reports unauthenticated on 'Not logged in'", () => {
		const result = parseCodexLoginStatus(
			probe({ stderr: "Not logged in\n", failed: true }),
		);
		expect(result.state).toBe("unauthenticated");
	});

	it("reports not_installed on ENOENT", () => {
		const result = parseCodexLoginStatus(
			probe({ notInstalled: true, failed: true }),
		);
		expect(result.state).toBe("not_installed");
	});

	it("reports unknown on unrecognized output", () => {
		const result = parseCodexLoginStatus(
			probe({ stderr: "some unexpected error", failed: true }),
		);
		expect(result.state).toBe("unknown");
	});
});

describe("parseGhAuthStatus", () => {
	const loggedInOutput = [
		"github.com",
		"  ✓ Logged in to github.com account octocat (keyring)",
		"  - Active account: true",
		"  - Token: gho_************************************",
	].join("\n");

	it("reports authenticated with account and host", () => {
		const result = parseGhAuthStatus(probe({ stdout: loggedInOutput }));
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("octocat on github.com");
	});

	it("reads status from stderr for older gh versions", () => {
		const result = parseGhAuthStatus(probe({ stderr: loggedInOutput }));
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("octocat on github.com");
	});

	it("never includes the masked token in the detail", () => {
		const result = parseGhAuthStatus(probe({ stdout: loggedInOutput }));
		expect(result.detail ?? "").not.toContain("gho_");
	});

	it("reports unauthenticated when not logged into any host", () => {
		const result = parseGhAuthStatus(
			probe({
				stderr:
					"You are not logged into any GitHub hosts. To log in, run: gh auth login",
				failed: true,
			}),
		);
		expect(result.state).toBe("unauthenticated");
	});

	it("still reports an account when another host's check fails", () => {
		const result = parseGhAuthStatus(
			probe({ stdout: loggedInOutput, failed: true }),
		);
		expect(result.state).toBe("authenticated");
		expect(result.detail).toBe("octocat on github.com");
	});

	it("reports not_installed on ENOENT", () => {
		const result = parseGhAuthStatus(
			probe({ notInstalled: true, failed: true }),
		);
		expect(result.state).toBe("not_installed");
	});

	it("reports unknown on unrecognized failure", () => {
		const result = parseGhAuthStatus(
			probe({ stderr: "network timeout", failed: true }),
		);
		expect(result.state).toBe("unknown");
	});
});
