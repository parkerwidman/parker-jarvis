import type { JarvisBackdropVariant } from "@/components/jarvis/backdrop/jarvis-page-backdrop";

export type JarvisVisualDomain =
  | "default"
  | "goals"
  | "melusi"
  | "fitness"
  | "assistant";

export function getJarvisVisualDomain(pathname: string): JarvisVisualDomain {
  if (pathname.startsWith("/goals")) {
    return "goals";
  }

  if (pathname.startsWith("/melusi")) {
    return "melusi";
  }

  if (pathname === "/fitness" || pathname.startsWith("/fitness/")) {
    return "fitness";
  }

  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) {
    return "assistant";
  }

  return "default";
}

export function getJarvisBackdropVariant(
  pathname: string,
): JarvisBackdropVariant {
  const domain = getJarvisVisualDomain(pathname);

  switch (domain) {
    case "goals":
      return "goals";
    case "melusi":
      return "melusi";
    case "fitness":
      return "fitness";
    case "assistant":
      return "subtle";
    default:
      return "none";
  }
}

export type JarvisNavDomain = "jarvis" | "goals" | "melusi" | "fitness" | "assistant";

export function getJarvisNavDomain(href: string): JarvisNavDomain {
  if (href.startsWith("/goals")) {
    return "goals";
  }

  if (href.startsWith("/melusi")) {
    return "melusi";
  }

  if (href === "/fitness") {
    return "fitness";
  }

  if (href === "/assistant") {
    return "assistant";
  }

  return "jarvis";
}
