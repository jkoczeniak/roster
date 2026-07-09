import {
	CONNECTOR_CATALOG,
	type CatalogConnector,
} from "@roster/shared/connector-catalog";
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
import { useMemo, useState } from "react";
import { LuCheck, LuGlobe, LuPlus, LuTerminal, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Per-agent connectors panel. Lists the MCP servers wired into this agent's
 * .mcp.json and offers a curated catalog + custom form to add more. This is
 * how a non-coding agent reaches its tools — Jira, Confluence, Linear, or a
 * company-internal endpoint. Remote connectors authenticate in-session via
 * the CLI's own OAuth flow (/mcp in Claude Code); Roster stores no secrets.
 */

type CustomKind = "remote" | "local";

function connectorTarget(c: {
	url?: string;
	command?: string;
	args?: string[];
}): string {
	if (c.url) return c.url;
	if (c.command) return [c.command, ...(c.args ?? [])].join(" ");
	return "";
}

export function ConnectorsView() {
	const { workspaceId } = useParams({ strict: false });
	const utils = electronTrpc.useUtils();

	const { data, isLoading } = electronTrpc.workspaces.listConnectors.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);

	const addConnector = electronTrpc.workspaces.addConnector.useMutation({
		onSuccess: () => utils.workspaces.listConnectors.invalidate(),
		onError: (err) => toast.error(err.message),
	});
	const removeConnector = electronTrpc.workspaces.removeConnector.useMutation({
		onSuccess: () => utils.workspaces.listConnectors.invalidate(),
		onError: (err) => toast.error(err.message),
	});

	const [showAdd, setShowAdd] = useState(false);

	const connectors = data?.connectors ?? [];
	const installedNames = useMemo(
		() => new Set(connectors.map((c) => c.name)),
		[connectors],
	);

	const handleAddCatalog = async (item: CatalogConnector) => {
		if (!workspaceId) return;
		await addConnector.mutateAsync({
			workspaceId,
			name: item.id,
			type: item.type,
			url: item.url,
		});
		setShowAdd(false);
		toast.success(
			`${item.label} connected — run /mcp in the agent's session to sign in`,
		);
	};

	const handleRemove = async (name: string) => {
		if (!workspaceId) return;
		await removeConnector.mutateAsync({ workspaceId, name });
	};

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
				Loading connectors…
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0 overflow-auto">
			{data?.error && (
				<div className="mx-3 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
					Couldn't read this agent's .mcp.json: {data.error}
				</div>
			)}

			{connectors.length === 0 && !data?.error ? (
				<div className="flex flex-col gap-2 p-4 text-sm text-muted-foreground">
					<p className="text-foreground/90 font-medium">
						Give this agent tools
					</p>
					<p className="text-xs">
						Connectors let the agent reach the systems it works with — Jira and
						Confluence for a ticket reviewer, Linear for a product agent, or
						your company's internal endpoints. Add one below; the agent signs
						in from its own session.
					</p>
				</div>
			) : (
				<div className="flex flex-col py-1">
					<div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
						Connected
					</div>
					{connectors.map((c) => (
						<div
							key={c.name}
							className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-tertiary/20 transition-colors"
							title={connectorTarget(c)}
						>
							{c.type === "stdio" ? (
								<LuTerminal className="size-3.5 shrink-0 text-muted-foreground" />
							) : (
								<LuGlobe className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<div className="flex flex-col min-w-0 flex-1">
								<span className="truncate text-foreground/90">{c.name}</span>
								<span className="truncate text-[11px] text-muted-foreground/70">
									{connectorTarget(c)}
								</span>
							</div>
							<button
								type="button"
								onClick={() => handleRemove(c.name)}
								className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
								title={`Remove ${c.name}`}
							>
								<LuX className="size-3.5" />
							</button>
						</div>
					))}
				</div>
			)}

			<div className="px-3 py-2">
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					onClick={() => setShowAdd(true)}
				>
					<LuPlus className="size-3.5 mr-1" />
					Add connector
				</Button>
			</div>

			{connectors.length > 0 && (
				<p className="px-4 pb-3 text-[11px] text-muted-foreground/70">
					Remote connectors sign in from the agent's session — type{" "}
					<code className="rounded bg-muted px-1">/mcp</code> in a Claude tab.
					{data?.runtime === "codex" &&
						" Connectors are mirrored into this agent's Codex config on launch."}
				</p>
			)}

			<AddConnectorDialog
				open={showAdd}
				onOpenChange={setShowAdd}
				installedNames={installedNames}
				onAddCatalog={handleAddCatalog}
				workspaceId={workspaceId}
				onAdded={() => utils.workspaces.listConnectors.invalidate()}
			/>
		</div>
	);
}

function AddConnectorDialog({
	open,
	onOpenChange,
	installedNames,
	onAddCatalog,
	workspaceId,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	installedNames: Set<string>;
	onAddCatalog: (item: CatalogConnector) => Promise<void>;
	workspaceId: string;
	onAdded: () => void;
}) {
	const [showCustom, setShowCustom] = useState(false);
	const [customKind, setCustomKind] = useState<CustomKind>("remote");
	const [customName, setCustomName] = useState("");
	const [customUrl, setCustomUrl] = useState("");
	const [customCommand, setCustomCommand] = useState("");
	const [pendingId, setPendingId] = useState<string | null>(null);

	const addConnector = electronTrpc.workspaces.addConnector.useMutation();

	const resetCustom = () => {
		setShowCustom(false);
		setCustomName("");
		setCustomUrl("");
		setCustomCommand("");
		setCustomKind("remote");
	};

	const handleCatalogClick = async (item: CatalogConnector) => {
		setPendingId(item.id);
		try {
			await onAddCatalog(item);
		} finally {
			setPendingId(null);
		}
	};

	const canAddCustom =
		customName.trim().length > 0 &&
		(customKind === "remote"
			? customUrl.trim().length > 0
			: customCommand.trim().length > 0) &&
		!addConnector.isPending;

	const handleAddCustom = async () => {
		if (!canAddCustom) return;
		try {
			if (customKind === "remote") {
				await addConnector.mutateAsync({
					workspaceId,
					name: customName.trim(),
					type: "http",
					url: customUrl.trim(),
				});
			} else {
				const parts = customCommand.trim().split(/\s+/);
				await addConnector.mutateAsync({
					workspaceId,
					name: customName.trim(),
					type: "stdio",
					command: parts[0],
					args: parts.slice(1),
				});
			}
			onAdded();
			toast.success(`Connector "${customName.trim()}" added`);
			resetCustom();
			onOpenChange(false);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to add connector",
			);
		}
	};

	return (
		<Dialog
			modal
			open={open}
			onOpenChange={(o) => {
				if (!o) resetCustom();
				onOpenChange(o);
			}}
		>
			<DialogContent className="sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>Add connector</DialogTitle>
				</DialogHeader>

				{!showCustom ? (
					<div className="flex flex-col gap-1 max-h-[50vh] overflow-auto -mx-1 px-1">
						{CONNECTOR_CATALOG.map((item) => {
							const installed = installedNames.has(item.id);
							return (
								<button
									key={item.id}
									type="button"
									disabled={installed || pendingId !== null}
									onClick={() => handleCatalogClick(item)}
									className="flex items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-tertiary/20 disabled:opacity-60 disabled:hover:bg-transparent transition-colors"
								>
									<LuGlobe className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
									<span className="flex flex-col min-w-0 flex-1">
										<span className="text-sm text-foreground/90">
											{item.label}
										</span>
										<span className="text-xs text-muted-foreground truncate">
											{item.description}
										</span>
									</span>
									{installed ? (
										<LuCheck className="size-4 shrink-0 text-green-500 mt-0.5" />
									) : pendingId === item.id ? (
										<span className="text-xs text-muted-foreground mt-0.5">
											Adding…
										</span>
									) : null}
								</button>
							);
						})}
						<button
							type="button"
							onClick={() => setShowCustom(true)}
							className="flex items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-tertiary/20 transition-colors"
						>
							<LuPlus className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
							<span className="flex flex-col min-w-0">
								<span className="text-sm text-foreground/90">Custom</span>
								<span className="text-xs text-muted-foreground">
									A company-internal MCP endpoint (ServiceNow, Confluence
									Server, …) or a local command
								</span>
							</span>
						</button>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<div className="flex gap-2">
							<Button
								variant={customKind === "remote" ? "secondary" : "ghost"}
								size="sm"
								onClick={() => setCustomKind("remote")}
							>
								<LuGlobe className="size-3.5 mr-1" /> Remote URL
							</Button>
							<Button
								variant={customKind === "local" ? "secondary" : "ghost"}
								size="sm"
								onClick={() => setCustomKind("local")}
							>
								<LuTerminal className="size-3.5 mr-1" /> Local command
							</Button>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="connector-name">Name</Label>
							<Input
								id="connector-name"
								value={customName}
								onChange={(e) => setCustomName(e.target.value)}
								placeholder="e.g. servicenow"
							/>
						</div>
						{customKind === "remote" ? (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="connector-url">Server URL</Label>
								<Input
									id="connector-url"
									value={customUrl}
									onChange={(e) => setCustomUrl(e.target.value)}
									placeholder="https://mcp.your-company.com/mcp"
									onKeyDown={(e) => {
										if (e.key === "Enter" && canAddCustom) handleAddCustom();
									}}
								/>
							</div>
						) : (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="connector-command">Command</Label>
								<Input
									id="connector-command"
									value={customCommand}
									onChange={(e) => setCustomCommand(e.target.value)}
									placeholder="npx -y some-mcp-server"
									onKeyDown={(e) => {
										if (e.key === "Enter" && canAddCustom) handleAddCustom();
									}}
								/>
							</div>
						)}
						<div className="flex justify-between gap-2 pt-1">
							<Button variant="ghost" size="sm" onClick={resetCustom}>
								Back
							</Button>
							<Button size="sm" onClick={handleAddCustom} disabled={!canAddCustom}>
								{addConnector.isPending ? "Adding…" : "Add connector"}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
