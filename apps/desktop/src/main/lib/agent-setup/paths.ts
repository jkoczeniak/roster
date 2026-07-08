import path from "node:path";
import { ROSTER_HOME_DIR } from "../app-environment";

export const BIN_DIR = path.join(ROSTER_HOME_DIR, "bin");
export const HOOKS_DIR = path.join(ROSTER_HOME_DIR, "hooks");
export const ZSH_DIR = path.join(ROSTER_HOME_DIR, "zsh");
export const BASH_DIR = path.join(ROSTER_HOME_DIR, "bash");
