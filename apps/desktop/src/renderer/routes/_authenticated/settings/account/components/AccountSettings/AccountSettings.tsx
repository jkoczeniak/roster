import { Button } from "@roster/ui/button";
import { Label } from "@roster/ui/label";
import { cn } from "@roster/ui/utils";
import { LuExternalLink, LuRefreshCw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

const AUTH_DOCS_URL =
	"https://github.com/jkoczeniak/roster/blob/main/docs/authentication.md";

type CliAuthState =
	| "authenticated"
	| "unauthenticated"
	| "not_installed"
	| "unknown";

const STATE_BADGE: Record<CliAuthState, { label: string; className: string }> =
	{
		authenticated: {
			label: "Logged in",
			className: "text-green-500 bg-green-500/10",
		},
		unauthenticated: {
			label: "Not connected",
			className: "text-amber-500 bg-amber-500/10",
		},
		not_installed: {
			label: "Not detected",
			className: "text-muted-foreground bg-accent/50",
		},
		unknown: {
			label: "Unknown",
			className: "text-muted-foreground bg-accent/50",
		},
	};

const CLI_DESCRIPTION: Record<string, string> = {
	claude: "Shared by all agents via your global ~/.claude login",
	codex: "One codex login signs in every agent",
	github: "Used by git pushes, PR status, and the gh CLI in agent terminals",
};

const LOGIN_HINT: Record<string, string> = {
	claude: "Run claude in any terminal and use /login",
	codex: "Run codex login in any terminal",
	github: "Run gh auth login in any terminal",
};

interface CliStatusRowProps {
	cli: string;
	displayName: string;
	state: CliAuthState;
	detail: string | null;
}

function CliStatusRow({ cli, displayName, state, detail }: CliStatusRowProps) {
	const badge = STATE_BADGE[state];
	const secondary =
		state === "authenticated"
			? (detail ?? CLI_DESCRIPTION[cli])
			: state === "unauthenticated"
				? LOGIN_HINT[cli]
				: state === "not_installed"
					? "CLI not found on your PATH"
					: (detail ?? "Couldn't determine login state");

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">{displayName}</Label>
				<p className="text-xs text-muted-foreground">{secondary}</p>
			</div>
			<span
				className={cn(
					"text-xs font-medium px-2 py-1 rounded-md",
					badge.className,
				)}
			>
				{badge.label}
			</span>
		</div>
	);
}

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const showAgentAuth = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_AGENT_AUTH,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const { data: statuses, isLoading } =
		electronTrpc.auth.getCliAuthStatus.useQuery();
	const refresh = electronTrpc.auth.refreshCliAuthStatus.useMutation({
		onSuccess: (data) => {
			utils.auth.getCliAuthStatus.setData(undefined, data);
		},
	});

	const openDocs = electronTrpc.external.openUrl.useMutation();

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Account</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Roster has no account of its own and stores no credentials. Agents
					inherit the logins of the CLIs installed on your machine.
				</p>
			</div>

			{showAgentAuth && (
				<div className="space-y-6">
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-sm font-semibold">Agent authentication</h3>
							<p className="text-xs text-muted-foreground mt-0.5">
								Which accounts your agents act as, per CLI
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => refresh.mutate()}
							disabled={refresh.isPending}
						>
							<LuRefreshCw
								className={cn(
									"h-3.5 w-3.5 mr-1.5",
									refresh.isPending && "animate-spin",
								)}
							/>
							Refresh
						</Button>
					</div>

					{isLoading && !statuses ? (
						<p className="text-xs text-muted-foreground">
							Checking CLI login state…
						</p>
					) : (
						<div className="space-y-4">
							{statuses?.map((status) => (
								<CliStatusRow
									key={status.cli}
									cli={status.cli}
									displayName={status.displayName}
									state={status.state}
									detail={status.detail}
								/>
							))}
						</div>
					)}

					<div className="pt-2 border-t border-border">
						<p className="text-xs text-muted-foreground">
							Each agent session runs a login shell that re-sources your
							dotfiles, so Claude Code, Codex, and git/gh see the same logins
							as your own terminal.{" "}
							<button
								type="button"
								className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 hover:no-underline"
								onClick={() => openDocs.mutate(AUTH_DOCS_URL)}
							>
								How authentication works
								<LuExternalLink className="h-3 w-3" />
							</button>
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
