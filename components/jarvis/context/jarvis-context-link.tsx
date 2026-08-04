import Link from "next/link";
import type { ReactNode } from "react";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";

type JarvisContextLinkProps = {
  target: JarvisContextTarget;
  children: ReactNode;
  className?: string;
};

export function JarvisContextLink({
  target,
  children,
  className,
}: JarvisContextLinkProps) {
  const href = `/assistant?contextType=${encodeURIComponent(target.type)}&contextId=${encodeURIComponent(target.id)}`;

  return (
    <Link href={href} className={className ?? "jarvis-context-link"}>
      {children}
    </Link>
  );
}
