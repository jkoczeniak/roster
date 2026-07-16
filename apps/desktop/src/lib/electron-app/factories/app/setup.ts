import { app, BrowserWindow, shell } from "electron";
import { env } from "main/env.main";
import { loadReactDevToolsExtension } from "main/lib/extensions";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevToolsExtension();

	// Restore windows from previous session if available
	if (restoreWindows) {
		await restoreWindows();
	}

	// If no windows were restored, create a new one
	const existingWindows = BrowserWindow.getAllWindows();
	let window: BrowserWindow;
	if (existingWindows.length > 0) {
		window = existingWindows[0];
	} else {
		window = await createWindow();
	}

	app.on("activate", async () => {
		const windows = BrowserWindow.getAllWindows();

		if (!windows.length) {
			window = await createWindow();
		} else {
			for (window of windows.reverse()) {
				window.restore();
			}
		}
	});

	app.on("web-contents-created", (_, contents) => {
		// Browser/DevTools <webview> panes navigate freely by design; only the app
		// window's own contents are locked to their origin here.
		if (contents.getType() === "webview") {
			// Deny popups from the moment the webview exists. Webviews are created
			// with allowpopups, and browser-manager only installs its own handler
			// (which routes popups into new panes) after the renderer registers the
			// pane on dom-ready — without this, a hostile page could window.open
			// during that gap and get Electron's default popup window.
			contents.setWindowOpenHandler(() => ({ action: "deny" }));
			return;
		}
		contents.on("will-navigate", (event, url) => {
			let target: URL;
			try {
				target = new URL(url);
			} catch {
				// Unparseable target — never let the app frame navigate to it.
				event.preventDefault();
				return;
			}

			// Same-origin navigations (initial load, dev HMR full reload) are fine.
			let sameOrigin = false;
			try {
				sameOrigin = new URL(contents.getURL()).origin === target.origin;
			} catch {
				sameOrigin = false;
			}
			if (sameOrigin) return;

			// Anything leaving the app origin is blocked. Real external links open
			// in the system browser; other schemes (file:, etc.) are just denied.
			event.preventDefault();
			if (target.protocol === "http:" || target.protocol === "https:") {
				void shell.openExternal(url);
			}
		});
	});

	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());
	app.on("before-quit", () => {});

	return window;
}

PLATFORM.IS_LINUX && app.disableHardwareAcceleration();

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");

// CDP (Chrome DevTools Protocol) is an UNAUTHENTICATED local control surface:
// once the remote-debugging-port is open, any local user/process that can reach
// loopback can attach and fully drive the app. It powers the built-in browser's
// DevTools pane (browser-manager.getDevToolsUrl, which returns null gracefully
// when the port is unset) and the desktop-automation MCP. Those are dev/power
// tooling, so we do NOT expose the port in a packaged production build unless
// the user explicitly opts in — in a packaged build the DevTools pane and the
// automation MCP are unavailable without ROSTER_ENABLE_CDP=1.
//
// remote-allow-origins stays scoped to the CDP server's own loopback origins
// (never "*") — Chromium's origin check exists precisely to stop web content
// (e.g. a page in a built-in browser pane) from attaching to the DevTools
// WebSocket. The DevTools frontend and the automation MCP connect from these.
const cdpOptIn =
	process.env.ROSTER_ENABLE_CDP === "1" ||
	process.env.ROSTER_ENABLE_CDP === "true";
if (env.NODE_ENV === "development" || cdpOptIn) {
	const cdpPort = String(process.env.DESKTOP_AUTOMATION_PORT || 41729);
	app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
	app.commandLine.appendSwitch(
		"remote-allow-origins",
		`http://127.0.0.1:${cdpPort},http://localhost:${cdpPort}`,
	);
}
