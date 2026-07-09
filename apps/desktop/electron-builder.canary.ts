/**
 * Electron Builder Configuration - Canary Build
 *
 * Extends the base config with canary-specific overrides for internal testing.
 * Can be installed side-by-side with the stable release.
 *
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder";
import pkg from "./package.json";

const productName = "Roster Canary";
const canaryMacIconPath = join(pkg.resources, "build/icons/icon-canary.icns");
const canaryLinuxIconPath = join(pkg.resources, "build/icons/icon-canary.png");
const canaryWinIconPath = join(pkg.resources, "build/icons/icon-canary.ico");

const config: Configuration = {
	...baseConfig,
	appId: "com.koczeniak.roster.canary",
	productName,

	// Inherit the public release repo from the base config (single source of
	// truth). Only the release type differs for canary.
	publish: {
		...(baseConfig.publish as Record<string, unknown>),
		releaseType: "prerelease",
	},

	mac: {
		...baseConfig.mac,
		...(existsSync(canaryMacIconPath) ? { icon: canaryMacIconPath } : {}),
		artifactName: `Roster-Canary-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},

	linux: {
		...baseConfig.linux,
		...(existsSync(canaryLinuxIconPath) ? { icon: canaryLinuxIconPath } : {}),
		synopsis: `${pkg.description} (Canary)`,
		artifactName: `roster-canary-\${version}-\${arch}.\${ext}`,
	},

	win: {
		...baseConfig.win,
		...(existsSync(canaryWinIconPath) ? { icon: canaryWinIconPath } : {}),
		artifactName: `Roster-Canary-\${version}-\${arch}.\${ext}`,
	},
};

export default config;
