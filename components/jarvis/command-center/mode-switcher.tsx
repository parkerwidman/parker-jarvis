"use client";

import { modeLabel } from "@/lib/jarvis/dashboard/command-center-mode";
import { useCommandCenterMode } from "./command-center-mode-provider";

export function ModeSwitcher() {
  const { mode, setMode } = useCommandCenterMode();

  return (
    <div className="cc2-mode-seg" role="group" aria-label="Command Center mode">
      <button
        type="button"
        className={`cc2-mode-seg-btn${mode === "personal" ? " cc2-mode-seg-btn--active" : ""}`}
        onClick={() => setMode("personal")}
        aria-pressed={mode === "personal"}
      >
        {modeLabel("personal")}
      </button>
      <button
        type="button"
        className={`cc2-mode-seg-btn${mode === "melusi" ? " cc2-mode-seg-btn--active" : ""}`}
        onClick={() => setMode("melusi")}
        aria-pressed={mode === "melusi"}
      >
        {modeLabel("melusi")}
      </button>
    </div>
  );
}
