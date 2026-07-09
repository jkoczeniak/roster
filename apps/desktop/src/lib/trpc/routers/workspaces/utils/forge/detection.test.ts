import { describe, expect, test } from "bun:test";
import {
	detectForgeKind,
	parseRemoteHost,
	remoteUrlToWebUrl,
} from "./detection";

describe("parseRemoteHost", () => {
	test("parses https URLs", () => {
		expect(parseRemoteHost("https://github.com/owner/repo.git")).toBe(
			"github.com",
		);
		expect(parseRemoteHost("https://gitlab.com/owner/repo.git")).toBe(
			"gitlab.com",
		);
	});

	test("parses https URLs with embedded credentials", () => {
		expect(
			parseRemoteHost("https://user:token@gitlab.example.com/owner/repo.git"),
		).toBe("gitlab.example.com");
	});

	test("parses ssh:// URLs, including custom ports", () => {
		expect(parseRemoteHost("ssh://git@github.com/owner/repo.git")).toBe(
			"github.com",
		);
		expect(
			parseRemoteHost("ssh://git@gitlab.corp.io:2222/owner/repo.git"),
		).toBe("gitlab.corp.io");
	});

	test("parses git:// URLs", () => {
		expect(parseRemoteHost("git://github.com/owner/repo.git")).toBe(
			"github.com",
		);
	});

	test("parses scp-like syntax", () => {
		expect(parseRemoteHost("git@github.com:owner/repo.git")).toBe("github.com");
		expect(parseRemoteHost("git@gitlab.company.com:group/sub/repo.git")).toBe(
			"gitlab.company.com",
		);
		expect(parseRemoteHost("gitlab.com:owner/repo.git")).toBe("gitlab.com");
	});

	test("lowercases the host", () => {
		expect(parseRemoteHost("https://GitHub.com/Owner/Repo.git")).toBe(
			"github.com",
		);
	});

	test("returns null for empty or unparseable input", () => {
		expect(parseRemoteHost("")).toBeNull();
		expect(parseRemoteHost("   ")).toBeNull();
		expect(parseRemoteHost("/local/path/to/repo")).toBeNull();
	});
});

describe("detectForgeKind", () => {
	test("detects github.com", () => {
		expect(detectForgeKind("https://github.com/owner/repo.git")).toBe("github");
		expect(detectForgeKind("git@github.com:owner/repo.git")).toBe("github");
	});

	test("detects GitHub Enterprise by hostname", () => {
		expect(detectForgeKind("https://github.mycorp.com/owner/repo.git")).toBe(
			"github",
		);
	});

	test("detects gitlab.com", () => {
		expect(detectForgeKind("https://gitlab.com/owner/repo.git")).toBe("gitlab");
		expect(detectForgeKind("git@gitlab.com:owner/repo.git")).toBe("gitlab");
	});

	test("detects self-hosted / enterprise GitLab by hostname", () => {
		expect(detectForgeKind("git@gitlab.enterprise.io:group/repo.git")).toBe(
			"gitlab",
		);
		expect(
			detectForgeKind("https://gitlab-flex.bigcorp.com/group/sub/repo.git"),
		).toBe("gitlab");
		expect(detectForgeKind("ssh://git@code.gitlab.internal/g/r.git")).toBe(
			"gitlab",
		);
	});

	test("detects GitLab subgroup paths", () => {
		expect(detectForgeKind("https://gitlab.com/group/subgroup/repo.git")).toBe(
			"gitlab",
		);
	});

	test("returns unknown for other hosts", () => {
		expect(detectForgeKind("https://bitbucket.org/owner/repo.git")).toBe(
			"unknown",
		);
		expect(detectForgeKind("git@git.sr.ht:~user/repo")).toBe("unknown");
		expect(detectForgeKind("https://codeberg.org/owner/repo.git")).toBe(
			"unknown",
		);
		expect(detectForgeKind("ssh://git@git.internal.corp/team/repo.git")).toBe(
			"unknown",
		);
	});

	test("returns unknown for empty or local remotes", () => {
		expect(detectForgeKind("")).toBe("unknown");
		expect(detectForgeKind("/Users/koz/repos/local-only")).toBe("unknown");
	});
});

describe("remoteUrlToWebUrl", () => {
	test("converts https URLs, stripping .git and credentials", () => {
		expect(remoteUrlToWebUrl("https://gitlab.com/owner/repo.git")).toBe(
			"https://gitlab.com/owner/repo",
		);
		expect(
			remoteUrlToWebUrl("https://user:token@gitlab.com/owner/repo.git"),
		).toBe("https://gitlab.com/owner/repo");
	});

	test("converts scp-like URLs", () => {
		expect(remoteUrlToWebUrl("git@github.com:owner/repo.git")).toBe(
			"https://github.com/owner/repo",
		);
		expect(remoteUrlToWebUrl("git@gitlab.corp.io:group/sub/repo.git")).toBe(
			"https://gitlab.corp.io/group/sub/repo",
		);
	});

	test("converts ssh:// URLs", () => {
		expect(remoteUrlToWebUrl("ssh://git@gitlab.com/owner/repo.git")).toBe(
			"https://gitlab.com/owner/repo",
		);
	});

	test("keeps URLs without .git suffix intact", () => {
		expect(remoteUrlToWebUrl("https://gitlab.com/owner/repo")).toBe(
			"https://gitlab.com/owner/repo",
		);
	});

	test("returns null for unparseable input", () => {
		expect(remoteUrlToWebUrl("")).toBeNull();
		expect(remoteUrlToWebUrl("/local/path")).toBeNull();
	});
});
