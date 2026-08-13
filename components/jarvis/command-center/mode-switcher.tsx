"use client";

import { modeLabel } from "@/lib/jarvis/dashboard/command-center-mode";
import { useJarvisWorkspace } from "@/components/jarvis/jarvis-workspace-provider";

function NotificationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.25c2.07 0 3.75 1.68 3.75 3.75v2.1c0 .52.15 1.03.44 1.47l.56.84a.75.75 0 01-.62 1.19H5.37a.75.75 0 01-.62-1.19l.56-.84a3 3 0 00.44-1.47V6c0-2.07 1.68-3.75 3.75-3.75z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 14.25a1.5 1.5 0 003 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M9 2.25v1.35M9 14.4v1.35M2.25 9h1.35M14.4 9h1.35M4.2 4.2l.95.95M12.85 12.85l.95.95M4.2 13.8l.95-.95M12.85 5.15l.95-.95"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ModeSwitcher() {
  const { workspace: mode, setWorkspace: setMode } = useJarvisWorkspace();

  return (
    <div className="cc2-header-utilities">
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
      <button
        type="button"
        className="cc2-header-icon-btn"
        aria-label="Notifications"
      >
        <NotificationIcon />
        <span className="cc2-header-icon-dot" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cc2-header-icon-btn"
        aria-label="Settings"
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
