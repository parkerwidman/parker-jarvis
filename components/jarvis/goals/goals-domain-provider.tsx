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
import type { JarvisGoalDomain } from "@/lib/jarvis/goals/types";

const GOALS_DOMAIN_STORAGE_KEY = "jarvis-goals-domain";

type GoalsDomainContextValue = {
  domain: JarvisGoalDomain;
  setDomain: (domain: JarvisGoalDomain) => void;
};

const GoalsDomainContext = createContext<GoalsDomainContextValue | null>(null);

function parseStoredDomain(value: string | null): JarvisGoalDomain {
  return value === "personal" ? "personal" : "melusi";
}

export function GoalsDomainProvider({ children }: { children: ReactNode }) {
  const [domain, setDomainState] = useState<JarvisGoalDomain>("melusi");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDomainState(parseStoredDomain(localStorage.getItem(GOALS_DOMAIN_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    document.body.dataset.mode = domain;
    localStorage.setItem(GOALS_DOMAIN_STORAGE_KEY, domain);

    return () => {
      delete document.body.dataset.mode;
    };
  }, [domain, hydrated]);

  const setDomain = useCallback((nextDomain: JarvisGoalDomain) => {
    setDomainState(nextDomain);
  }, []);

  const value = useMemo(() => ({ domain, setDomain }), [domain, setDomain]);

  return (
    <GoalsDomainContext.Provider value={value}>{children}</GoalsDomainContext.Provider>
  );
}

export function useGoalsDomain(): GoalsDomainContextValue {
  const context = useContext(GoalsDomainContext);

  if (!context) {
    throw new Error("useGoalsDomain must be used within GoalsDomainProvider");
  }

  return context;
}
