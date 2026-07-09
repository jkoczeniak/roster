import { COMPANY } from "@roster/shared/constants";
import { Avatar } from "@roster/ui/atoms/Avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@roster/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import {
	HiChevronUpDown,
	HiOutlineBookOpen,
	HiOutlineCog6Tooth,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard } from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { useHotkeyText } from "renderer/stores/hotkeys";

export function OrganizationDropdown() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const settingsHotkey = useHotkeyText("OPEN_SETTINGS");
	const shortcutsHotkey = useHotkeyText("SHOW_HOTKEYS");

	function openExternal(url: string): void {
		window.open(url, "_blank");
	}

	const userName = session?.user?.name;
	const displayName = userName ?? "Menu";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="Menu"
				>
					<Avatar size="xs" fullName={userName} className="rounded size-4" />
					<span className="text-xs font-medium truncate max-w-32">
						{displayName}
					</span>
					<HiChevronUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/appearance" })}
				>
					<HiOutlineCog6Tooth className="h-4 w-4" />
					<span>Settings</span>
					{settingsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{settingsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				{/* Help & Support */}
				<DropdownMenuItem onClick={() => openExternal(COMPANY.DOCS_URL)}>
					<HiOutlineBookOpen className="h-4 w-4" />
					Documentation
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => navigate({ to: "/settings/keyboard" })}
				>
					<LuKeyboard className="h-4 w-4" />
					Keyboard Shortcuts
					{shortcutsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => openExternal(COMPANY.REPORT_ISSUE_URL)}
				>
					<IoBugOutline className="h-4 w-4" />
					Report Issue
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
