export type JarvisWorkspace = "personal" | "melusi";

export const JARVIS_WORKSPACE_COOKIE = "jarvis-workspace";

/** @deprecated Use JARVIS_WORKSPACE_COOKIE */
export const MODE_STORAGE_KEY = "jarvis-command-center-mode";

/** @deprecated Migrate reads from jarvis-goals-domain to canonical key */
export const LEGACY_GOALS_DOMAIN_STORAGE_KEY = "jarvis-goals-domain";

export function isJarvisWorkspace(value: string): value is JarvisWorkspace {
  return value === "personal" || value === "melusi";
}

/** Canonical default when no persisted workspace exists (matches Command Center). */
export function defaultJarvisWorkspace(): JarvisWorkspace {
  return "melusi";
}

export function parseJarvisWorkspace(value: string | null | undefined): JarvisWorkspace {
  return value === "personal" ? "personal" : defaultJarvisWorkspace();
}

export function workspaceLabel(workspace: JarvisWorkspace): string {
  return workspace === "melusi" ? "Melusi" : "Personal";
}

export function workspaceTagLabel(workspace: JarvisWorkspace): string {
  return workspace === "melusi" ? "MELUSI" : "PERSONAL";
}

export function isMelusiLifeArea(lifeAreaName: string | null | undefined): boolean {
  return lifeAreaName?.trim().toLowerCase() === "melusi";
}

export function itemMatchesWorkspace(
  lifeAreaName: string | null | undefined,
  workspace: JarvisWorkspace,
): boolean {
  const isMelusi = isMelusiLifeArea(lifeAreaName);
  return workspace === "melusi" ? isMelusi : !isMelusi;
}

export function goalDomainMatchesWorkspace(
  domain: JarvisWorkspace | string | null | undefined,
  workspace: JarvisWorkspace,
): boolean {
  return domain === workspace;
}

export function serializeWorkspaceCookie(workspace: JarvisWorkspace): string {
  return `${JARVIS_WORKSPACE_COOKIE}=${workspace}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
