"use client";

import type { ReactNode } from "react";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import { useJarvisContext } from "./jarvis-context-provider";

type JarvisContextButtonProps = {
  target: JarvisContextTarget;
  displayLabel: string;
  children?: ReactNode;
  className?: string;
};

export function JarvisContextButton({
  target,
  displayLabel,
  children = "Ask Jarvis",
  className,
}: JarvisContextButtonProps) {
  const { selectContext, target: selectedTarget } = useJarvisContext();
  const isSelected =
    selectedTarget?.type === target.type && selectedTarget?.id === target.id;

  const classes = [
    "jarvis-context-btn",
    isSelected ? "jarvis-context-btn--active" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={() => selectContext(target, displayLabel)}
      aria-pressed={isSelected}
      aria-label={`Select ${displayLabel} for Jarvis`}
    >
      {children}
    </button>
  );
}
