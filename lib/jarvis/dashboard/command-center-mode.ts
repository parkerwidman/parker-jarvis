export type CommandCenterMode = "melusi" | "personal";

export const MODE_STORAGE_KEY = "jarvis-command-center-mode";

export function isMelusiLifeArea(lifeAreaName: string | null | undefined): boolean {
  return lifeAreaName?.trim().toLowerCase() === "melusi";
}

export function itemMatchesMode(
  lifeAreaName: string | null | undefined,
  mode: CommandCenterMode,
): boolean {
  const isMelusi = isMelusiLifeArea(lifeAreaName);
  return mode === "melusi" ? isMelusi : !isMelusi;
}

export function modeLabel(mode: CommandCenterMode): string {
  return mode === "melusi" ? "Melusi" : "Personal";
}

export function modeTagLabel(mode: CommandCenterMode): string {
  return mode === "melusi" ? "MELUSI" : "PERSONAL";
}

export function parseStoredMode(value: string | null): CommandCenterMode {
  return value === "personal" ? "personal" : "melusi";
}
