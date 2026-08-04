"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  JarvisContextInitial,
  JarvisContextTarget,
} from "@/lib/jarvis/context/types";

type JarvisContextValue = {
  target: JarvisContextTarget | null;
  displayLabel: string | null;
  selectContext: (target: JarvisContextTarget, displayLabel?: string) => void;
  clearContext: () => void;
};

const JarvisContext = createContext<JarvisContextValue | null>(null);

type JarvisContextProviderProps = {
  children: ReactNode;
  initialContext?: JarvisContextInitial | null;
};

export function JarvisContextProvider({
  children,
  initialContext = null,
}: JarvisContextProviderProps) {
  const [target, setTarget] = useState<JarvisContextTarget | null>(() =>
    initialContext
      ? { type: initialContext.type, id: initialContext.id }
      : null,
  );
  const [displayLabel, setDisplayLabel] = useState<string | null>(
    initialContext?.displayLabel ?? null,
  );

  const selectContext = useCallback(
    (nextTarget: JarvisContextTarget, label?: string) => {
      setTarget(nextTarget);
      setDisplayLabel(label?.trim() || null);

      const panel = document.getElementById("jarvis-embedded-panel");

      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        panel.focus({ preventScroll: true });
      }
    },
    [],
  );

  const clearContext = useCallback(() => {
    setTarget(null);
    setDisplayLabel(null);
  }, []);

  const value = useMemo(
    () => ({
      target,
      displayLabel,
      selectContext,
      clearContext,
    }),
    [target, displayLabel, selectContext, clearContext],
  );

  return (
    <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>
  );
}

export function useJarvisContext(): JarvisContextValue {
  const context = useContext(JarvisContext);

  if (!context) {
    throw new Error("useJarvisContext must be used within JarvisContextProvider");
  }

  return context;
}

export function useOptionalJarvisContext(): JarvisContextValue | null {
  return useContext(JarvisContext);
}
