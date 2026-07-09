import { Label } from "@roster/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@roster/ui/select";
import { useState } from "react";
import type { TerminalEngineKind } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/engine";
import {
	getPreferredEngine,
	TERMINAL_ENGINE_STORAGE_KEY,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/engine";

export function EngineSetting() {
	const [engine, setEngine] = useState<TerminalEngineKind>(() =>
		getPreferredEngine(),
	);

	const handleChange = (value: string) => {
		const next: TerminalEngineKind = value === "xterm" ? "xterm" : "ghostty";
		setEngine(next);
		try {
			localStorage.setItem(TERMINAL_ENGINE_STORAGE_KEY, next);
		} catch {
			// ignore storage errors
		}
	};

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="terminal-engine" className="text-sm font-medium">
					Engine
				</Label>
				<p className="text-xs text-muted-foreground">
					How terminal text is drawn. Ghostty is faster; xterm.js maximizes
					compatibility. Applies to newly opened terminals.
				</p>
			</div>
			<Select value={engine} onValueChange={handleChange}>
				<SelectTrigger id="terminal-engine" className="w-[200px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="ghostty">Ghostty (recommended)</SelectItem>
					<SelectItem value="xterm">xterm.js</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
