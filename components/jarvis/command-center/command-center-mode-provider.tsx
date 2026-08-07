"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  MODE_STORAGE_KEY,
  parseStoredMode,
  type CommandCenterMode,
} from "@/lib/jarvis/dashboard/command-center-mode";

type CommandCenterModeContextValue = {
  mode: CommandCenterMode;
  setMode: (mode: CommandCenterMode) => void;
};

const CommandCenterModeContext =
  createContext<CommandCenterModeContextValue | null>(null);

export function CommandCenterModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CommandCenterMode>("melusi");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(parseStoredMode(localStorage.getItem(MODE_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    document.body.dataset.mode = mode;
    localStorage.setItem(MODE_STORAGE_KEY, mode);

    return () => {
      delete document.body.dataset.mode;
    };
  }, [hydrated, mode]);

  const setMode = useCallback((nextMode: CommandCenterMode) => {
    setModeState(nextMode);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <CommandCenterModeContext.Provider value={value}>
      {children}
    </CommandCenterModeContext.Provider>
  );
}

export function useCommandCenterMode(): CommandCenterModeContextValue {
  const context = useContext(CommandCenterModeContext);

  if (!context) {
    throw new Error(
      "useCommandCenterMode must be used within CommandCenterModeProvider",
    );
  }

  return context;
}
