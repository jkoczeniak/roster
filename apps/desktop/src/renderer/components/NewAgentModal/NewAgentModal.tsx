import type { AGENT_RUNTIMES } from "@roster/local-db";
import {
	type AgentBinary,
	type CheckedBinary,
	RUNTIME_BINARY,
} from "@roster/shared/agent-binaries";
import { AGENT_LABELS } from "@roster/shared/agent-command";
import { Button } from "@roster/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@roster/ui/dialog";
import { Input } from "@roster/ui/input";
import { Label } from "@roster/ui/label";
import { RadioGroup, RadioGroupItem } from "@roster/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@roster/ui/select";
import { toast } from "@roster/ui/sonner";
import { Textarea } from "@roster/ui/textarea";
import { useNavigate } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { BinaryInstallDialog } from "renderer/components/BinaryInstallDialog/BinaryInstallDialog";
import { downscaleImageToDataUrl } from "renderer/lib/downscale-image";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useRuntimeAvailability } from "renderer/stores/model-bar/useRuntimeAvailability";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";

type RepoMode = "init" | "folder" | "clone" | "local";

/** Runtimes offered in the New Agent picker. */
const RUNTIME_CHOICES = ["claude", "codex"] as const;

/**
 * Create an Agent inside a Team. Persona-first: name + role seed the agent's
 * identity (AGENT.md); the workspace defaults to a plain folder — no git — with
 * repo/clone options tucked behind a version-control disclosure for the
 * minority of agents that work in a codebase. Calls workspaces.createAgent
 * (which builds the workspace and scaffolds memory + skills).
 * Reuses the new-workspace-modal store (preSelectedProjectId = the team).
 */
export function NewAgentModal() {
	const navigate = useNavigate();
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const categoryId = usePreSelectedProjectId();
	const utils = electronTrpc.useUtils();
	const { isAvailable, recheck, isFetching } = useRuntimeAvailability();

	const [name, setName] = useState("");
	const [role, setRole] = useState("");
	const [runtime, setRuntime] =
		useState<(typeof AGENT_RUNTIMES)[number]>("claude");
	const [repoMode, setRepoMode] = useState<RepoMode>("folder");
	const [showGitOptions, setShowGitOptions] = useState(false);
	const [cloneUrl, setCloneUrl] = useState("");
	const [localPath, setLocalPath] = useState("");
	const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
	const [installBinary, setInstallBinary] = useState<AgentBinary | null>(null);
	const photoInputRef = useRef<HTMLInputElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const createAgent = electronTrpc.workspaces.createAgent.useMutation();
	const setWorkspaceIcon =
		electronTrpc.workspaces.setWorkspaceIcon.useMutation();

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset each open
	useEffect(() => {
		if (!isOpen) return;
		setName("");
		setRole("");
		setRuntime("claude");
		setRepoMode("folder");
		setShowGitOptions(false);
		setCloneUrl("");
		setLocalPath("");
		setPhotoDataUrl(null);
		const t = setTimeout(() => nameInputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [isOpen]);

	const handlePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		try {
			setPhotoDataUrl(await downscaleImageToDataUrl(file));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not load image");
		}
	};

	// Building the agent's repo (init OR clone) shells to git, which a fresh Mac
	// lacks until the Command Line Tools are installed. Block create until it's
	// present rather than letting agent-repo fail with a generic error. A folder
	// agent runs no git at all, so it stays creatable even without git.
	const gitMissing = !isAvailable("git");
	const gitRequired = repoMode !== "folder";
	const runtimeBinary = RUNTIME_BINARY[runtime];
	const runtimeMissing = !isAvailable(runtimeBinary as CheckedBinary);

	const canCreate =
		!!categoryId &&
		name.trim().length > 0 &&
		!(gitRequired && gitMissing) &&
		(repoMode === "init" ||
			repoMode === "folder" ||
			(repoMode === "clone" && cloneUrl.trim().length > 0) ||
			(repoMode === "local" && localPath.trim().length > 0)) &&
		!createAgent.isPending;

	const handleCreate = async () => {
		if (!categoryId || !canCreate) return;
		try {
			const result = await createAgent.mutateAsync({
				projectId: categoryId,
				name: name.trim(),
				role: role.trim() || undefined,
				runtime,
				repo:
					repoMode === "clone"
						? { type: "clone", url: cloneUrl.trim() }
						: repoMode === "local"
							? { type: "clone", url: localPath.trim() }
							: repoMode === "folder"
								? { type: "folder" }
								: { type: "init" },
			});
			if (photoDataUrl) {
				await setWorkspaceIcon.mutateAsync({
					id: result.workspace.id,
					icon: photoDataUrl,
				});
			}
			await utils.workspaces.getAllGrouped.invalidate();
			closeModal();
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: result.workspace.id },
			});
			toast.success(`Agent "${name.trim()}" created`);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create agent",
			);
		}
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && closeModal()}>
			<DialogContent className="sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>New agent</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => photoInputRef.current?.click()}
							className="size-12 shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs text-muted-foreground border border-border"
						>
							{photoDataUrl ? (
								<img
									src={photoDataUrl}
									alt=""
									className="size-full object-cover"
								/>
							) : (
								"Photo"
							)}
						</button>
						<div className="flex-1">
							<Label htmlFor="agent-name">Name</Label>
							<Input
								id="agent-name"
								ref={nameInputRef}
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. Scout"
								onKeyDown={(e) => {
									if (e.key === "Enter" && canCreate) handleCreate();
								}}
							/>
						</div>
					</div>
					<input
						ref={photoInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/svg+xml"
						className="hidden"
						onChange={handlePhoto}
					/>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-role">Role</Label>
						<Textarea
							id="agent-role"
							value={role}
							onChange={(e) => setRole(e.target.value)}
							rows={2}
							maxLength={280}
							placeholder={`What should this agent do? e.g. "Review the ticket queue each morning and draft updates"`}
							className="resize-none"
						/>
						<p className="text-xs text-muted-foreground">
							Optional — this seeds the agent's identity. It keeps its own
							memory and refines itself as you work together.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Powered by</Label>
						<Select
							value={runtime}
							onValueChange={(v) =>
								setRuntime(v as (typeof AGENT_RUNTIMES)[number])
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RUNTIME_CHOICES.map((r) => {
									const missing = !isAvailable(
										RUNTIME_BINARY[r] as CheckedBinary,
									);
									return (
										<SelectItem key={r} value={r}>
											<span className="flex items-center gap-2">
												{AGENT_LABELS[r]}
												{missing && (
													<span className="text-xs text-muted-foreground">
														· not installed
													</span>
												)}
											</span>
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
						{runtimeMissing && (
							<p className="text-xs text-muted-foreground">
								{AGENT_LABELS[runtime]} isn't installed yet — the agent will be
								created, but it can't run sessions until you install it.{" "}
								<button
									type="button"
									className="text-foreground underline underline-offset-2 hover:no-underline"
									onClick={() => setInstallBinary(runtimeBinary)}
								>
									Install
								</button>
							</p>
						)}
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Workspace</Label>
						<p className="text-xs text-muted-foreground">
							Every agent gets its own folder for files, memory, and skills.
						</p>
						{!showGitOptions ? (
							<button
								type="button"
								className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
								onClick={() => setShowGitOptions(true)}
							>
								Working in a codebase? Use git version control…
							</button>
						) : (
							<RadioGroup
								value={repoMode}
								onValueChange={(v) => setRepoMode(v as RepoMode)}
								className="flex flex-col gap-2"
							>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="folder" id="repo-folder" />
									<Label htmlFor="repo-folder" className="font-normal">
										Plain folder — no git
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="init" id="repo-init" />
									<Label htmlFor="repo-init" className="font-normal">
										New empty git repo
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="clone" id="repo-clone" />
									<Label htmlFor="repo-clone" className="font-normal">
										Clone from URL
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="local" id="repo-local" />
									<Label htmlFor="repo-local" className="font-normal">
										Clone from local path
									</Label>
								</div>
							</RadioGroup>
						)}
						{repoMode === "clone" && (
							<Input
								value={cloneUrl}
								onChange={(e) => setCloneUrl(e.target.value)}
								placeholder="https://github.com/owner/repo.git"
							/>
						)}
						{repoMode === "local" && (
							<Input
								value={localPath}
								onChange={(e) => setLocalPath(e.target.value)}
								placeholder="/Users/you/code/my-repo"
							/>
						)}
					</div>
				</div>

				{gitMissing && gitRequired && (
					<div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs">
						<p className="font-medium text-foreground">Git is required</p>
						<p className="text-muted-foreground">
							The workspace option you picked sets up a git repository, and Git
							isn't installed. Install Apple's Command Line Tools, then re-check
							— or switch back to a plain folder:
						</p>
						<code className="select-all rounded bg-background/60 px-2 py-1 font-mono">
							xcode-select --install
						</code>
						<button
							type="button"
							onClick={recheck}
							disabled={isFetching}
							className="inline-flex w-fit items-center gap-1 text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50"
						>
							<HiArrowPath
								className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
							/>
							{isFetching ? "Checking…" : "Re-check"}
						</button>
					</div>
				)}

				<div className="flex justify-end gap-2">
					<Button variant="ghost" onClick={() => closeModal()}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={!canCreate}>
						{createAgent.isPending ? "Creating…" : "Create agent"}
					</Button>
				</div>

				<BinaryInstallDialog
					binary={installBinary}
					onOpenChange={(open) => !open && setInstallBinary(null)}
					onRecheck={recheck}
					isRechecking={isFetching}
				/>
			</DialogContent>
		</Dialog>
	);
}
