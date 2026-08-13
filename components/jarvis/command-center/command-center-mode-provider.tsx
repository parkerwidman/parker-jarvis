"use client";

export {
  JarvisWorkspaceProvider as CommandCenterModeProvider,
  useJarvisWorkspace,
} from "@/components/jarvis/jarvis-workspace-provider";

import { useJarvisWorkspace } from "@/components/jarvis/jarvis-workspace-provider";
import type { JarvisWorkspace } from "@/lib/jarvis/shell/jarvis-workspace";

/** @deprecated Prefer useJarvisWorkspace */
export function useCommandCenterMode(): {
  mode: JarvisWorkspace;
  setMode: (workspace: JarvisWorkspace) => void;
  workspace: JarvisWorkspace;
  setWorkspace: (workspace: JarvisWorkspace) => void;
} {
  const { workspace, setWorkspace } = useJarvisWorkspace();

  return {
    mode: workspace,
    setMode: setWorkspace,
    workspace,
    setWorkspace,
  };
}
