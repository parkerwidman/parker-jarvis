"use client";

import type { ReactNode } from "react";
import { JarvisContextProvider } from "./context/jarvis-context-provider";

type CommandCenterContextLayoutProps = {
  children: ReactNode;
};

export function CommandCenterContextLayout({
  children,
}: CommandCenterContextLayoutProps) {
  return <JarvisContextProvider>{children}</JarvisContextProvider>;
}
