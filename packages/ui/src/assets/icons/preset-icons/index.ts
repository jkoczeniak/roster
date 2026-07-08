import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";

export interface PresetIconSet {
	light: string;
	dark: string;
}

export const PRESET_ICONS: Record<string, PresetIconSet> = {
	claude: { light: claudeIcon, dark: claudeIcon },
	codex: { light: codexIcon, dark: codexWhiteIcon },
};

export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return isDark ? iconSet.dark : iconSet.light;
}

export { claudeIcon, codexIcon, codexWhiteIcon };
