import { Button } from "@roster/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@roster/ui/dialog";
import { Input } from "@roster/ui/input";
import { Label } from "@roster/ui/label";
import { toast } from "@roster/ui/sonner";
import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { LuFileText, LuPlus } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

type AgentFileGroup = "Memory" | "Skills" | "Worktree";

interface AgentFileEntry {
	label: string;
	group: AgentFileGroup;
	absolutePath: string;
	relativeToWorktree: string | null;
}

const GROUP_ORDER: AgentFileGroup[] = ["Memory", "Skills", "Worktree"];

/** User-facing group labels — "Worktree" is dev plumbing, show it as such. */
const GROUP_LABELS: Record<AgentFileGroup, string> = {
	Memory: "Memory",
	Skills: "Skills",
	Worktree: "Setup files",
};

/**
 * The agent's identity surface: its persona (AGENT.md), what it has learned
 * (MEMORY.md, the shared USER.md), and the skills it has written for itself.
 * Files appear as the agent learns; click one to read or edit it.
 */
export function AgentFilesView() {
	const { workspaceId } = useParams({ strict: false });
	const utils = electronTrpc.useUtils();
	const { data: files, isLoading } =
		electronTrpc.workspaces.listAgentFiles.useQuery(
			{ workspaceId: workspaceId ?? "" },
			{ enabled: !!workspaceId },
		);

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const [showNewSkill, setShowNewSkill] = useState(false);
	const [skillName, setSkillName] = useState("");
	const createSkill = electronTrpc.workspaces.createSkill.useMutation();

	const handleActivate = useCallback(
		(entry: AgentFileEntry) => {
			if (!workspaceId) return;
			// In-worktree files open via the worktree-relative path; out-of-worktree
			// memory/skill files open via their absolute path. Both are pinned so
			// they persist as real tabs.
			if (entry.relativeToWorktree) {
				addFileViewerPane(workspaceId, {
					filePath: entry.relativeToWorktree,
					isPinned: true,
				});
				return;
			}
			addFileViewerPane(workspaceId, {
				filePath: entry.label,
				absolutePath: entry.absolutePath,
				isPinned: true,
			});
		},
		[workspaceId, addFileViewerPane],
	);

	const handleCreateSkill = async () => {
		if (!workspaceId || !skillName.trim() || createSkill.isPending) return;
		try {
			const { skillPath } = await createSkill.mutateAsync({
				workspaceId,
				name: skillName.trim(),
			});
			await utils.workspaces.listAgentFiles.invalidate();
			setShowNewSkill(false);
			setSkillName("");
			// Open the fresh SKILL.md so the user (or the agent) can fill it in.
			addFileViewerPane(workspaceId, {
				filePath: `skills/${skillName.trim()}`,
				absolutePath: skillPath,
				isPinned: true,
			});
			toast.success(
				"Skill created — fill in the procedure, or ask the agent to",
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create skill",
			);
		}
	};

	const grouped = useMemo(() => {
		const map = new Map<AgentFileGroup, AgentFileEntry[]>();
		for (const entry of files ?? []) {
			const list = map.get(entry.group) ?? [];
			list.push(entry);
			map.set(entry.group, list);
		}
		return map;
	}, [files]);

	if (!workspaceId) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No agent selected
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Loading agent files…
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0 overflow-auto py-1">
			<p className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground/70">
				The agent's persona, memory, and skills. It reads these every session
				and updates them as it learns — click a file to read or edit.
			</p>

			{(!files || files.length === 0) && (
				<div className="px-3 py-3 text-sm text-muted-foreground">
					No agent files yet — they appear once setup finishes.
				</div>
			)}

			{(files?.length ?? 0) > 0 &&
				GROUP_ORDER.map((group) => {
					const entries = grouped.get(group);
					const isSkills = group === "Skills";
					if ((!entries || entries.length === 0) && !isSkills) return null;
					return (
						<div key={group} className="flex flex-col">
							<div className="flex items-center justify-between px-3 pt-2 pb-1">
								<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
									{GROUP_LABELS[group]}
								</span>
								{isSkills && (
									<button
										type="button"
										onClick={() => setShowNewSkill(true)}
										className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
										title="Start a new skill for this agent"
									>
										<LuPlus className="size-3" />
										New skill
									</button>
								)}
							</div>
							{isSkills && (!entries || entries.length === 0) && (
								<p className="px-3 pb-1 text-[11px] text-muted-foreground/60">
									Skills are step-by-step procedures the agent follows — it
									writes its own as it learns, or start one for it.
								</p>
							)}
							{(entries ?? []).map((entry) => (
								<button
									key={entry.absolutePath}
									type="button"
									onClick={() => handleActivate(entry)}
									className="flex items-center gap-2 px-3 py-1 text-sm text-left text-foreground/90 hover:bg-tertiary/20 transition-colors"
									title={entry.absolutePath}
								>
									<LuFileText className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{entry.label}</span>
								</button>
							))}
						</div>
					);
				})}

			<Dialog
				modal
				open={showNewSkill}
				onOpenChange={(o) => {
					setShowNewSkill(o);
					if (!o) setSkillName("");
				}}
			>
				<DialogContent className="sm:max-w-[380px]">
					<DialogHeader>
						<DialogTitle>New skill</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="skill-name">What is the skill?</Label>
						<Input
							id="skill-name"
							value={skillName}
							onChange={(e) => setSkillName(e.target.value)}
							placeholder="e.g. Weekly ticket review"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateSkill();
							}}
						/>
						<p className="text-xs text-muted-foreground">
							Creates a SKILL.md template the agent loads when the task fits.
							Fill it in yourself, or ask the agent to write it.
						</p>
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" onClick={() => setShowNewSkill(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreateSkill}
							disabled={!skillName.trim() || createSkill.isPending}
						>
							{createSkill.isPending ? "Creating…" : "Create skill"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
