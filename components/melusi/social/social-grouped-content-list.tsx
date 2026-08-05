"use client";

import { useState } from "react";
import type {
  GroupedCoreContent,
  NetworkPublicationMetrics,
  SocialContentType,
  SocialNetworkKey,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import {
  NETWORK_DISPLAY_NAMES,
  SOCIAL_CAVEATS,
} from "@/lib/jarvis/integrations/metricool/metricool-social-display";
import { SocialInfoDisclosure } from "@/components/melusi/social/social-info-disclosure";

function formatMetricValue(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function publicationMetrics(publication: NetworkPublicationMetrics): Array<{
  label: string;
  value: string;
}> {
  const metrics: Array<{ label: string; value: string }> = [];

  if (publication.reach !== null) {
    metrics.push({ label: "Reach", value: formatMetricValue(publication.reach) });
  }

  if (publication.impressions !== null) {
    metrics.push({
      label: "Impressions",
      value: formatMetricValue(publication.impressions),
    });
  }

  if (publication.views !== null) {
    metrics.push({ label: "Views", value: formatMetricValue(publication.views) });
  }

  if (publication.likes !== null) {
    metrics.push({ label: "Likes", value: formatMetricValue(publication.likes) });
  }

  if (publication.comments !== null) {
    metrics.push({
      label: "Comments",
      value: formatMetricValue(publication.comments),
    });
  }

  if (publication.shares !== null) {
    metrics.push({ label: "Shares", value: formatMetricValue(publication.shares) });
  }

  if (publication.clicks !== null) {
    metrics.push({ label: "Clicks", value: formatMetricValue(publication.clicks) });
  }

  return metrics.slice(0, 4);
}

function formatPostDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

type SocialGroupedContentListProps = {
  groups: GroupedCoreContent[];
  timeZone: string;
  networkFilter: "all" | SocialNetworkKey;
  contentFilter: "all" | SocialContentType;
  initialLimit?: number;
};

export function SocialGroupedContentList({
  groups,
  timeZone,
  networkFilter,
  contentFilter,
  initialLimit = 12,
}: SocialGroupedContentListProps) {
  const filtered = groups.filter((group) => {
    if (networkFilter !== "all" && !group.networks.includes(networkFilter)) {
      return false;
    }

    if (contentFilter !== "all" && group.postType !== contentFilter) {
      return false;
    }

    return true;
  });

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? filtered : filtered.slice(0, initialLimit);

  if (filtered.length === 0) {
    return (
      <p className="social-quiet-note">No recent published content matches these filters.</p>
    );
  }

  return (
    <>
      <ul className="social-grouped-content-list">
        {visible.map((group) => (
          <li key={group.id} className="social-grouped-content-row">
            <div className="social-grouped-content-main">
              {group.mediaPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.mediaPreviewUrl}
                  alt=""
                  className="social-grouped-content-thumb"
                />
              ) : null}
              <div className="social-grouped-content-copy">
                <div className="social-grouped-content-meta">
                  <time dateTime={group.publicationDate}>
                    {formatPostDate(group.publicationDate, timeZone)}
                  </time>
                  <span>{group.postType}</span>
                  {group.networks.length > 1 ? (
                    <span className="social-grouped-content-networks">
                      {group.networks
                        .map((network) => NETWORK_DISPLAY_NAMES[network])
                        .join(" · ")}
                    </span>
                  ) : null}
                  {group.groupingConfidence === "inferred" ? (
                    <span className="social-grouped-content-inferred">Inferred group</span>
                  ) : null}
                </div>
                <p className="social-grouped-content-caption">{group.caption}</p>
              </div>
            </div>
            <ul className="social-grouped-publications">
              {group.publications.map((publication) => {
                const metrics = publicationMetrics(publication);

                return (
                  <li key={`${group.id}-${publication.network}`}>
                    <div className="social-publication-head">
                      <span>{NETWORK_DISPLAY_NAMES[publication.network]}</span>
                      {publication.permalink ? (
                        <a
                          href={publication.permalink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="social-post-link"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                    {metrics.length > 0 ? (
                      <dl className="social-publication-metrics">
                        {metrics.map((metric) => (
                          <div key={metric.label}>
                            <dt>{metric.label}</dt>
                            <dd>{metric.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="social-quiet-note">No supported metrics returned.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      {filtered.length > initialLimit ? (
        <button
          type="button"
          className="social-expand-btn"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? "Show fewer"
            : `View more (${filtered.length - initialLimit} remaining)`}
        </button>
      ) : null}
      <p className="social-section-footnote">
        <SocialInfoDisclosure
          label="Content ranking limitations"
          content={SOCIAL_CAVEATS.contentRanking}
        />
      </p>
    </>
  );
}