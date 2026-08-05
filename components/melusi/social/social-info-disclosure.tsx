"use client";

import { useId, useState } from "react";

type SocialInfoDisclosureProps = {
  label: string;
  content: string;
  className?: string;
};

export function SocialInfoDisclosure({
  label,
  content,
  className = "",
}: SocialInfoDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <span className={`social-info-disclosure ${className}`.trim()}>
      <button
        type="button"
        className="social-info-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="social-info-disclosure-icon" aria-hidden="true">
          i
        </span>
        <span className="social-info-disclosure-label">{label}</span>
      </button>
      {open ? (
        <span id={panelId} role="tooltip" className="social-info-disclosure-panel">
          {content}
        </span>
      ) : null}
    </span>
  );
}
