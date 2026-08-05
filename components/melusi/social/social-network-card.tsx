"use client";

import { useState } from "react";
import type {
  MetricValue,
  NetworkPerformanceSnapshot,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import { SOCIAL_CAVEATS } from "@/lib/jarvis/integrations/metricool/metricool-social-display";
import { SocialComparison } from "@/components/melusi/social/social-comparison";
import { SocialInfoDisclosure } from "@/components/melusi/social/social-info-disclosure";

function MetricRow({ metric }: { metric: MetricValue }) {
  const isUnavailable = metric.unavailable || metric.value === null;

  return (
    <div className="social-metric-row">
      <div className="social-metric-head">
        <span className="social-metric-label">{metric.label}</span>
        <span
          className={`social-metric-value${isUnavailable ? " social-metric-value--unavailable" : ""}`}
        >
          {isUnavailable && metric.formatted === "—" ? "Unavailable" : metric.formatted}
        </span>
      </div>
      <SocialComparison comparison={metric.comparison} />
    </div>
  );
}

export function SocialNetworkCard({ network }: { network: NetworkPerformanceSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const hasSecondary = network.secondaryMetrics.some(
    (metric) => metric.value !== null || metric.unavailable,
  );

  return (
    <article className="social-network-card">
      <div className="social-network-card-header">
        <h3>{network.displayName}</h3>
        {!network.available ? (
          <span className="social-network-flag social-network-flag--error">Unavailable</span>
        ) : network.limitedData ? (
          <span className="social-network-flag">Limited data</span>
        ) : null}
      </div>

      {network.limitedDataReason ? (
        <p className="social-network-note">{network.limitedDataReason}</p>
      ) : null}

      <div className="social-network-basis">
        <span>{network.engagementBasisLabel}</span>
        <SocialInfoDisclosure
          label="About this metric"
          content={SOCIAL_CAVEATS.networkEngagement}
        />
      </div>

      {network.available ? (
        <div className="social-metric-list">
          {network.metrics.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
          {expanded
            ? network.secondaryMetrics.map((metric) => (
                <MetricRow key={`secondary-${metric.label}`} metric={metric} />
              ))
            : null}
        </div>
      ) : (
        <p className="social-quiet-note">Network analytics unavailable for this period.</p>
      )}

      {hasSecondary ? (
        <button
          type="button"
          className="social-expand-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide additional metrics" : "Show additional metrics"}
        </button>
      ) : null}

      {network.warnings.map((warning) => (
        <p key={warning} className="social-inline-warning">
          {warning}
        </p>
      ))}
    </article>
  );
}
