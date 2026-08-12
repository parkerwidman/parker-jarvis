"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { JarvisPageBackdrop } from "@/components/jarvis/backdrop/jarvis-page-backdrop";
import { JarvisSpaceEnvironment } from "@/components/jarvis/backdrop/jarvis-space-environment";
import { JarvisSidebar } from "@/components/jarvis/jarvis-sidebar";
import {
  getJarvisBackdropVariant,
  getJarvisVisualDomain,
} from "@/lib/jarvis/shell/jarvis-domain";

type JarvisShellFrameProps = {
  children: ReactNode;
  displayName: string;
  userEmail: string | null;
  mainClassName?: string;
};

export function JarvisShellFrame({
  children,
  displayName,
  userEmail,
  mainClassName,
}: JarvisShellFrameProps) {
  const pathname = usePathname();
  const domain = getJarvisVisualDomain(pathname);
  const backdropVariant = getJarvisBackdropVariant(pathname);
  const mainClasses = ["app-main", "jarvis-app-main", mainClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="app-shell cc2-app-shell jarvis-app-shell"
      data-domain={domain}
    >
      <JarvisSpaceEnvironment />
      <JarvisPageBackdrop variant={backdropVariant} />
      <JarvisSidebar displayName={displayName} userEmail={userEmail} />
      <div className={mainClasses}>{children}</div>
    </div>
  );
}
