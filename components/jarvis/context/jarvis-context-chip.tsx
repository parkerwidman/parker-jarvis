"use client";

import { jarvisContextTypeLabel } from "@/lib/jarvis/context/types";
import { useOptionalJarvisContext } from "./jarvis-context-provider";

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function JarvisContextChip() {
  const context = useOptionalJarvisContext();

  if (!context?.target) {
    return null;
  }

  const typeLabel = jarvisContextTypeLabel(context.target.type);
  const chipText = context.displayLabel
    ? `${typeLabel} · ${context.displayLabel}`
    : typeLabel;

  return (
    <div className="jarvis-context-chip">
      <span className="jarvis-context-chip-text">{chipText}</span>
      <button
        type="button"
        className="jarvis-context-chip-clear"
        onClick={context.clearContext}
        aria-label="Clear selected context"
      >
        <ClearIcon />
      </button>
    </div>
  );
}
