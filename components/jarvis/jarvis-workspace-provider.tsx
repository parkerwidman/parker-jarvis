"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  JARVIS_WORKSPACE_COOKIE,
  LEGACY_GOALS_DOMAIN_STORAGE_KEY,
  MODE_STORAGE_KEY,
  parseJarvisWorkspace,
  serializeWorkspaceCookie,
  type JarvisWorkspace,
} from "@/lib/jarvis/shell/jarvis-workspace";

type JarvisWorkspaceContextValue = {
  workspace: JarvisWorkspace;
  setWorkspace: (workspace: JarvisWorkspace) => void;
};

const JarvisWorkspaceContext = createContext<JarvisWorkspaceContextValue | null>(null);

function readPersistedWorkspace(): JarvisWorkspace {
  if (typeof document === "undefined") {
    return parseJarvisWorkspace(null);
  }

  const cookieMatch = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${JARVIS_WORKSPACE_COOKIE}=`));

  if (cookieMatch) {
    return parseJarvisWorkspace(cookieMatch.split("=")[1] ?? null);
  }

  const canonical = localStorage.getItem(MODE_STORAGE_KEY);
  if (canonical !== null) {
    return parseJarvisWorkspace(canonical);
  }

  const legacyGoals = localStorage.getItem(LEGACY_GOALS_DOMAIN_STORAGE_KEY);
  if (legacyGoals !== null) {
    return parseJarvisWorkspace(legacyGoals);
  }

  return parseJarvisWorkspace(null);
}

function persistWorkspace(workspace: JarvisWorkspace): void {
  document.cookie = serializeWorkspaceCookie(workspace);
  localStorage.setItem(MODE_STORAGE_KEY, workspace);
  localStorage.setItem(LEGACY_GOALS_DOMAIN_STORAGE_KEY, workspace);
  document.body.dataset.mode = workspace;
}

type JarvisWorkspaceProviderProps = {
  children: ReactNode;
  initialWorkspace?: JarvisWorkspace;
};

export function JarvisWorkspaceProvider({
  children,
  initialWorkspace,
}: JarvisWorkspaceProviderProps) {
  const router = useRouter();
  const [workspace, setWorkspaceState] = useState<JarvisWorkspace>(
    initialWorkspace ?? parseJarvisWorkspace(null),
  );
  const [hydrated, setHydrated] = useState(false);
  const shouldRefreshRef = useRef(false);

  useEffect(() => {
    const persisted = readPersistedWorkspace();
    setWorkspaceState((current) => (current === persisted ? current : persisted));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    persistWorkspace(workspace);

    if (shouldRefreshRef.current) {
      shouldRefreshRef.current = false;
      startTransition(() => {
        router.refresh();
      });
    }
  }, [hydrated, workspace, router]);

  const setWorkspace = useCallback(
    (nextWorkspace: JarvisWorkspace) => {
      if (workspace === nextWorkspace) {
        return;
      }

      shouldRefreshRef.current = true;
      setWorkspaceState(nextWorkspace);
    },
    [workspace],
  );

  const value = useMemo(() => ({ workspace, setWorkspace }), [workspace, setWorkspace]);

  return (
    <JarvisWorkspaceContext.Provider value={value}>{children}</JarvisWorkspaceContext.Provider>
  );
}

export function useJarvisWorkspace(): JarvisWorkspaceContextValue {
  const context = useContext(JarvisWorkspaceContext);

  if (!context) {
    throw new Error("useJarvisWorkspace must be used within JarvisWorkspaceProvider");
  }

  return context;
}
