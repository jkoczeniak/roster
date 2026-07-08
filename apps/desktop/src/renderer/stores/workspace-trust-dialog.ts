import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorkspaceTrustDialogState {
	isOpen: boolean;
	isPending: boolean;
	/** Repo root whose `.roster/config.json` setup commands are being gated. */
	root: string;
	/** The exact commands that would run, shown read-only for review. */
	commands: string[];
	/** "Run and trust this folder" — persist trust then run the setup commands. */
	onConfirm: (() => void) | null;
	/** "Skip" — open the workspace without running the setup commands. */
	onSkip: (() => void) | null;
	open: (params: {
		root: string;
		commands: string[];
		onConfirm: () => void;
		onSkip: () => void;
	}) => void;
	setIsPending: (isPending: boolean) => void;
	close: () => void;
}

export const useWorkspaceTrustDialogStore = create<WorkspaceTrustDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			isPending: false,
			root: "",
			commands: [],
			onConfirm: null,
			onSkip: null,

			open: ({ root, commands, onConfirm, onSkip }) => {
				set({
					isOpen: true,
					isPending: false,
					root,
					commands,
					onConfirm,
					onSkip,
				});
			},

			setIsPending: (isPending) => {
				set({ isPending });
			},

			close: () => {
				set({
					isOpen: false,
					isPending: false,
					root: "",
					commands: [],
					onConfirm: null,
					onSkip: null,
				});
			},
		}),
		{ name: "WorkspaceTrustDialogStore" },
	),
);
