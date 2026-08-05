"use client";

import type { ComparisonDisplay } from "@/lib/jarvis/integrations/metricool/metricool-social-types";

export function SocialComparison({ comparison }: { comparison: ComparisonDisplay | null }) {
  if (!comparison) {
    return null;
  }

  switch (comparison.kind) {
    case "percent": {
      const prefix = comparison.direction === "up" ? "Up" : "Down";
      return (
        <span
          className={`social-comparison social-comparison--${comparison.direction}`}
        >
          {prefix} {Math.round(Math.abs(comparison.value))}%
        </span>
      );
    }
    case "new_activity":
      return <span className="social-comparison social-comparison--new">New activity</span>;
    case "flat":
      return (
        <span
          className="social-comparison social-comparison--flat"
          aria-label="No material period-over-period change."
          title="No material period-over-period change."
        >
          —
        </span>
      );
    case "unavailable":
      return (
        <span className="social-comparison social-comparison--unavailable">
          {comparison.reason}
        </span>
      );
  }
}
