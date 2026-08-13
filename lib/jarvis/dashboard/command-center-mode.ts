export type CommandCenterMode = "melusi" | "personal";

export {
  defaultJarvisWorkspace,
  goalDomainMatchesWorkspace,
  isMelusiLifeArea,
  itemMatchesWorkspace as itemMatchesMode,
  JARVIS_WORKSPACE_COOKIE,
  LEGACY_GOALS_DOMAIN_STORAGE_KEY,
  MODE_STORAGE_KEY,
  parseJarvisWorkspace as parseStoredMode,
  workspaceLabel as modeLabel,
  workspaceTagLabel as modeTagLabel,
  type JarvisWorkspace,
} from "@/lib/jarvis/shell/jarvis-workspace";
