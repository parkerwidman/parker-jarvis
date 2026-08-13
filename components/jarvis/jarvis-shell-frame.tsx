"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { JarvisPageBackdrop } from "@/components/jarvis/backdrop/jarvis-page-backdrop";
import { JarvisSpaceEnvironment } from "@/components/jarvis/backdrop/jarvis-space-environment";
import { JarvisWorkspaceProvider } from "@/components/jarvis/jarvis-workspace-provider";
import { JarvisSidebar } from "@/components/jarvis/jarvis-sidebar";
import {
  getJarvisBackdropVariant,
  getJarvisVisualDomain,
} from "@/lib/jarvis/shell/jarvis-domain";
import type { JarvisWorkspace } from "@/lib/jarvis/shell/jarvis-workspace";

type JarvisShellFrameProps = {
  children: ReactNode;
  displayName: string;
  userEmail: string | null;
  mainClassName?: string;
  initialWorkspace: JarvisWorkspace;
};

export function JarvisShellFrame({
  children,
  displayName,
  userEmail,
  mainClassName,
  initialWorkspace,
}: JarvisShellFrameProps) {
  const pathname = usePathname();
  const domain = getJarvisVisualDomain(pathname);
  const backdropVariant = getJarvisBackdropVariant(pathname);
  const mainClasses = ["app-main", "jarvis-app-main", mainClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <JarvisWorkspaceProvider initialWorkspace={initialWorkspace}>
      <div
        className="app-shell cc2-app-shell jarvis-app-shell"
        data-domain={domain}
      >
        <JarvisSpaceEnvironment />
        <JarvisPageBackdrop variant={backdropVariant} />
        <JarvisSidebar displayName={displayName} userEmail={userEmail} />
        <div className={mainClasses}>{children}</div>
      </div>
    </JarvisWorkspaceProvider>
  );
}
