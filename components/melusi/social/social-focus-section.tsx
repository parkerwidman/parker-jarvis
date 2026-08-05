"use client";

import type { SocialFocus } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import { NETWORK_DISPLAY_NAMES } from "@/lib/jarvis/integrations/metricool/metricool-social-display";

type SocialFocusSectionProps = {
  focus: SocialFocus;
};

function focusBadgeClass(category: SocialFocus["category"]): string {
  return `social-focus-badge social-focus-badge--${category}`;
}

export function SocialFocusSection({ focus }: SocialFocusSectionProps) {
  return (
    <section className="social-focus" aria-labelledby="social-focus-heading">
      <div className="social-focus-header">
        <h2 id="social-focus-heading">Social Focus</h2>
        <span className={focusBadgeClass(focus.category)}>{focus.category}</span>
      </div>
      <p className="social-focus-title">{focus.title}</p>
      <p className="social-focus-explanation">{focus.explanation}</p>
      <div className="social-focus-footer">
        <p className="social-focus-action">
          <span>Next action:</span> {focus.nextAction}
        </p>
        {focus.platform ? (
          <p className="social-focus-context">
            {NETWORK_DISPLAY_NAMES[focus.platform]}
            {focus.contentType ? ` · ${focus.contentType}` : ""}
          </p>
        ) : null}
        {focus.sectionAnchor ? (
          <a href={focus.sectionAnchor} className="social-focus-link">
            Go to section
          </a>
        ) : null}
      </div>
    </section>
  );
}
