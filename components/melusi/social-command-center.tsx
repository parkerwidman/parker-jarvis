"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ComparisonDisplay,
  NetworkPerformanceSnapshot,
  RecentSocialPost,
  ScheduledSocialPost,
  SocialAlert,
  SocialCommandCenterSnapshot,
  SocialContentType,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import type { SocialNetworkKey } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import { NETWORK_DISPLAY_NAMES } from "@/lib/jarvis/integrations/metricool/metricool-social-display";
import { MetricoolConnectionActions } from "@/components/melusi/metricool-connection-panel";
import { JarvisAlert, JarvisCard } from "@/components/jarvis/jarvis-ui";

type SocialCommandCenterProps = {
  snapshot: SocialCommandCenterSnapshot | null;
  loadError: string | null;
  timeZone: string;
  canVerify: boolean;
  canDisconnect: boolean;
  canReconnect: boolean;
};

const NETWORK_FILTERS: Array<{ value: "all" | SocialNetworkKey; label: string }> =
  [
    { value: "all", label: "All networks" },
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "tiktok", label: "TikTok" },
    { value: "twitter", label: "X" },
  ];

const CONTENT_FILTERS: Array<{ value: "all" | SocialContentType; label: string }> =
  [
    { value: "all", label: "All types" },
    { value: "post", label: "Posts" },
    { value: "carousel", label: "Carousels" },
    { value: "image", label: "Images" },
    { value: "reel", label: "Reels" },
    { value: "video", label: "Videos" },
    { value: "story", label: "Stories" },
  ];

function formatDateTime(isoString: string | null, timeZone: string): string {
  if (!isoString) {
    return "—";
  }

  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
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

function comparisonLabel(comparison: ComparisonDisplay | null): string {
  if (!comparison) {
    return "";
  }

  switch (comparison.kind) {
    case "new_activity":
      return "New activity this period";
    case "unavailable":
      return comparison.reason;
    case "percent": {
      const prefix =
        comparison.direction === "up"
          ? "Up"
          : comparison.direction === "down"
            ? "Down"
            : "Flat";
      return `${prefix} ${Math.round(Math.abs(comparison.value))}% vs prior period`;
    }
  }
}

function paceLabel(pace: string): string {
  switch (pace) {
    case "ahead":
      return "Ahead";
    case "behind":
      return "Behind";
    default:
      return "On pace";
  }
}

function alertBadgeClass(category: SocialAlert["category"]): string {
  return `social-alert-badge social-alert-badge--${category}`;
}

function ConnectionHealthBadge({
  status,
}: {
  status: SocialCommandCenterSnapshot["connection"]["status"];
}) {
  const label =
    status === "connected"
      ? "Connected"
      : status === "reconnect_required"
        ? "Reconnect required"
        : status === "error"
          ? "Connection error"
          : status === "connecting"
            ? "Connecting"
            : "Not connected";

  return <span className={`social-status-badge social-status-badge--${status}`}>{label}</span>;
}

function MetricRow({
  metric,
}: {
  metric: NetworkPerformanceSnapshot["metrics"][number];
}) {
  const comparison = comparisonLabel(metric.comparison);

  return (
    <div className="social-metric-row">
      <div className="social-metric-head">
        <span className="social-metric-label">{metric.label}</span>
        <span className="social-metric-value">{metric.formatted}</span>
      </div>
      {comparison ? (
        <span className="social-metric-comparison">{comparison}</span>
      ) : null}
      {metric.definition ? (
        <span className="social-metric-definition">{metric.definition}</span>
      ) : null}
    </div>
  );
}

function NetworkCard({ network }: { network: NetworkPerformanceSnapshot }) {
  return (
    <article className="social-network-card">
      <div className="social-network-card-header">
        <h3>{network.displayName}</h3>
        {!network.available ? (
          <span className="social-network-flag">Unavailable</span>
        ) : network.limitedData ? (
          <span className="social-network-flag">Limited data</span>
        ) : null}
      </div>
      {network.limitedDataReason ? (
        <p className="social-network-note">{network.limitedDataReason}</p>
      ) : null}
      <p className="social-network-note">
        Engagement context: {network.engagementDenominator}
      </p>
      <div className="social-metric-list">
        {network.metrics.map((metric) => (
          <MetricRow key={metric.label} metric={metric} />
        ))}
      </div>
      {network.warnings.map((warning) => (
        <p key={warning} className="social-inline-warning">
          {warning}
        </p>
      ))}
    </article>
  );
}

function PostCard({
  post,
  timeZone,
}: {
  post: RecentSocialPost;
  timeZone: string;
}) {
  return (
    <article className="social-post-card">
      <div className="social-post-card-header">
        <span className="social-post-network">
          {NETWORK_DISPLAY_NAMES[post.network]}
        </span>
        <span className="social-post-type">{post.postType}</span>
        <time dateTime={post.publicationDate}>
          {formatPostDate(post.publicationDate, timeZone)}
        </time>
      </div>
      <p className="social-post-caption">{post.caption}</p>
      <dl className="social-post-metrics">
        {post.reach !== null ? (
          <>
            <dt>Reach</dt>
            <dd>{post.reach}</dd>
          </>
        ) : null}
        {post.impressions !== null ? (
          <>
            <dt>Impressions</dt>
            <dd>{post.impressions}</dd>
          </>
        ) : null}
        {post.views !== null ? (
          <>
            <dt>Views</dt>
            <dd>{post.views}</dd>
          </>
        ) : null}
        {post.likes !== null ? (
          <>
            <dt>Likes</dt>
            <dd>{post.likes}</dd>
          </>
        ) : null}
        {post.comments !== null ? (
          <>
            <dt>Comments</dt>
            <dd>{post.comments}</dd>
          </>
        ) : null}
        {post.shares !== null ? (
          <>
            <dt>Shares</dt>
            <dd>{post.shares}</dd>
          </>
        ) : null}
        {post.engagementRate !== null ? (
          <>
            <dt>Engagement</dt>
            <dd>{post.engagementRate}</dd>
          </>
        ) : null}
      </dl>
      {post.permalink ? (
        <a
          href={post.permalink}
          className="social-post-link"
          target="_blank"
          rel="noreferrer noopener"
        >
          View on platform
        </a>
      ) : null}
    </article>
  );
}

function ScheduledCard({
  post,
  timeZone,
}: {
  post: ScheduledSocialPost;
  timeZone: string;
}) {
  return (
    <article className="social-scheduled-card">
      <div className="social-scheduled-header">
        <time dateTime={post.publicationDate}>
          {formatPostDate(post.publicationDate, timeZone)} ({post.timezone})
        </time>
        <span className="social-scheduled-status">{post.statusLabel}</span>
      </div>
      <p className="social-scheduled-networks">
        {post.networks.map((network) => NETWORK_DISPLAY_NAMES[network]).join(", ") ||
          "Networks pending"}
      </p>
      <p className="social-post-caption">{post.caption || "No caption"}</p>
      <p className="social-scheduled-meta">
        {post.draft ? "Draft" : "Scheduled"}
        {post.autoPublish === false ? " · Manual publish" : ""}
        {post.postType ? ` · ${post.postType}` : ""}
      </p>
    </article>
  );
}

export function SocialCommandCenter({
  snapshot,
  loadError,
  timeZone,
  canVerify,
  canDisconnect,
  canReconnect,
}: SocialCommandCenterProps) {
  const router = useRouter();
  const [networkFilter, setNetworkFilter] = useState<"all" | SocialNetworkKey>("all");
  const [contentFilter, setContentFilter] = useState<"all" | SocialContentType>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.recentPosts.filter((post) => {
      if (networkFilter !== "all" && post.network !== networkFilter) {
        return false;
      }

      if (contentFilter !== "all" && post.postType !== contentFilter) {
        return false;
      }

      return true;
    });
  }, [snapshot, networkFilter, contentFilter]);

  async function handleRefresh() {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    setRefreshError(null);

    try {
      const response = await fetch("/api/integrations/metricool/refresh", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setRefreshError("Could not refresh social analytics.");
        return;
      }

      router.refresh();
    } catch {
      setRefreshError("Could not refresh social analytics.");
    } finally {
      setRefreshing(false);
    }
  }

  const importantAlerts =
    snapshot?.alerts.filter(
      (alert) => alert.category === "error" || alert.category === "warning",
    ) ?? [];

  return (
    <div className="social-command-center">
      <header className="social-header">
        <div className="social-header-copy">
          <Link href="/melusi" className="jv-back-link">
            ← Melusi Command Center
          </Link>
          <div className="social-header-title-row">
            <h1 className="melusi-title">Social Command Center</h1>
            <span className="social-readonly-badge">Read-only</span>
          </div>
          <p className="melusi-subtitle">
            Live Metricool analytics for Melusi&apos;s trusted brand. Scheduling
            and publishing are not enabled in this step.
          </p>
        </div>
        <div className="social-header-actions">
          {snapshot ? (
            <ConnectionHealthBadge status={snapshot.connection.status} />
          ) : null}
          <button
            type="button"
            className="jv-btn jv-btn--secondary"
            onClick={handleRefresh}
            disabled={refreshing || snapshot?.connection.status !== "connected"}
          >
            {refreshing ? "Refreshing…" : "Refresh analytics"}
          </button>
        </div>
      </header>

      {loadError ? <JarvisAlert variant="error">{loadError}</JarvisAlert> : null}
      {refreshError ? <JarvisAlert variant="error">{refreshError}</JarvisAlert> : null}
      {snapshot?.limitedHistory && snapshot.limitedHistoryDetail ? (
        <JarvisAlert variant="info">{snapshot.limitedHistoryDetail}</JarvisAlert>
      ) : null}

      <section className="social-summary-grid">
        <JarvisCard title="Metricool connection" accent="purple">
          {snapshot?.connection.status === "connected" ? (
            <div className="social-connection-panel">
              <ConnectionHealthBadge status={snapshot.connection.status} />
              <p className="jv-connection-meta">
                Verified read-only access for {snapshot.connection.brandLabel ?? "melusiai"}.
              </p>
              <dl className="melusi-connection-details">
                <div>
                  <dt>Last verified</dt>
                  <dd>
                    {formatDateTime(snapshot.connection.lastVerifiedAt, timeZone)}
                  </dd>
                </div>
                <div>
                  <dt>Latest refresh</dt>
                  <dd>{formatDateTime(snapshot.refreshedAt, timeZone)}</dd>
                </div>
                <div>
                  <dt>Connected networks</dt>
                  <dd>{snapshot.connection.connectedNetworks.join(", ") || "—"}</dd>
                </div>
              </dl>
              <MetricoolConnectionActions
                canVerify={canVerify}
                canDisconnect={canDisconnect}
                canReconnect={canReconnect}
              />
            </div>
          ) : (
            <div className="social-connection-panel">
              <ConnectionHealthBadge
                status={snapshot?.connection.status ?? "disconnected"}
              />
              <p className="jv-connection-meta">
                Connect Metricool to load live social analytics for the trusted
                Melusi brand.
              </p>
              <MetricoolConnectionActions
                canVerify={canVerify}
                canDisconnect={canDisconnect}
                canReconnect={canReconnect}
              />
              {!canReconnect && !canVerify ? (
                <a
                  href="/api/integrations/metricool/connect"
                  className="jv-btn jv-btn--primary jv-btn--inline"
                >
                  Connect Metricool
                </a>
              ) : null}
            </div>
          )}
        </JarvisCard>

        <JarvisCard title="Posting cadence" accent="blue">
          {snapshot ? (
            <div className="social-cadence-panel">
              <div className="social-cadence-row">
                <span>Static posts</span>
                <strong>
                  {snapshot.cadence.staticActual} / {snapshot.cadence.staticTarget}
                </strong>
                <span>{paceLabel(snapshot.cadence.staticPace)}</span>
              </div>
              <div className="social-cadence-row">
                <span>Reels / short-form</span>
                <strong>
                  {snapshot.cadence.reelActual} / {snapshot.cadence.reelTarget}
                </strong>
                <span>{paceLabel(snapshot.cadence.reelPace)}</span>
              </div>
              <p className="social-panel-note">
                {snapshot.cadence.countingMethod === "unique_content"
                  ? "Unique core content items when planner relationships were available."
                  : "Platform publications — unique content relationships could not be established reliably."}
              </p>
              <ul className="social-limitations-list">
                {snapshot.cadence.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="cc-empty">Connect Metricool to calculate posting cadence.</p>
          )}
        </JarvisCard>

        <JarvisCard title="Recent published content" accent="green">
          {snapshot ? (
            <div className="social-summary-stat">
              <span className="cc-stat-value">{snapshot.recentPosts.length}</span>
              <span className="cc-stat-meta">{snapshot.recentContentPeriodLabel}</span>
            </div>
          ) : (
            <p className="cc-empty">No recent content loaded.</p>
          )}
        </JarvisCard>

        <JarvisCard title="Upcoming scheduled content" accent="amber">
          {snapshot ? (
            snapshot.upcomingScheduled.length > 0 ? (
              <div className="social-summary-stat">
                <span className="cc-stat-value">
                  {snapshot.upcomingScheduled.length}
                </span>
                <span className="cc-stat-meta">
                  {snapshot.upcomingSchedulePeriodLabel}
                </span>
              </div>
            ) : (
              <p className="cc-empty">No upcoming posts scheduled</p>
            )
          ) : (
            <p className="cc-empty">Schedule data unavailable.</p>
          )}
        </JarvisCard>

        <JarvisCard title="Important social alerts" accent="amber">
          {snapshot ? (
            importantAlerts.length > 0 ? (
              <ul className="social-alert-list">
                {importantAlerts.slice(0, 4).map((alert) => (
                  <li key={alert.id} className="social-alert-item">
                    <span className={alertBadgeClass(alert.category)}>
                      {alert.category}
                    </span>
                    <div>
                      <span className="social-alert-title">{alert.title}</span>
                      <p className="social-alert-detail">{alert.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No important alerts right now.</p>
            )
          ) : (
            <p className="cc-empty">Alerts unavailable.</p>
          )}
        </JarvisCard>
      </section>

      {snapshot ? (
        <>
          <section className="social-section">
            <div className="social-section-header">
              <h2>Network performance</h2>
              <p>
                Current period: {snapshot.currentPeriodLabel}. Comparison:{" "}
                {snapshot.comparisonPeriodLabel}. Metrics are shown separately
                per platform.
              </p>
            </div>
            <div className="social-network-grid">
              {snapshot.networks.map((network) => (
                <NetworkCard key={network.network} network={network} />
              ))}
            </div>
          </section>

          <section className="social-section">
            <div className="social-section-header">
              <h2>Content performance</h2>
              <p>
                Top and weak comparisons stay within the same network and content
                type when enough mature records exist.
              </p>
            </div>
            <div className="social-highlight-grid">
              <JarvisCard title="Top-performing recent content" accent="green">
                {snapshot.topPerforming ? (
                  <div className="social-highlight-card">
                    <p className="social-highlight-meta">
                      {NETWORK_DISPLAY_NAMES[snapshot.topPerforming.network]} ·{" "}
                      {snapshot.topPerforming.postType} ·{" "}
                      {snapshot.topPerforming.metricLabel}:{" "}
                      {snapshot.topPerforming.metricValue}
                    </p>
                    <p>{snapshot.topPerforming.caption}</p>
                    <p className="social-panel-note">{snapshot.topPerforming.note}</p>
                  </div>
                ) : (
                  <p className="cc-empty">Not enough comparable content yet.</p>
                )}
              </JarvisCard>
              <JarvisCard title="Weakest mature comparable content" accent="amber">
                {snapshot.weakestMature ? (
                  <div className="social-highlight-card">
                    <p className="social-highlight-meta">
                      {NETWORK_DISPLAY_NAMES[snapshot.weakestMature.network]} ·{" "}
                      {snapshot.weakestMature.postType} ·{" "}
                      {snapshot.weakestMature.metricLabel}:{" "}
                      {snapshot.weakestMature.metricValue}
                    </p>
                    <p>{snapshot.weakestMature.caption}</p>
                    <p className="social-panel-note">{snapshot.weakestMature.note}</p>
                  </div>
                ) : (
                  <p className="cc-empty">Not enough comparable content yet.</p>
                )}
              </JarvisCard>
            </div>

            <div className="social-filter-row">
              <label className="social-filter">
                <span>Network</span>
                <select
                  value={networkFilter}
                  onChange={(event) =>
                    setNetworkFilter(event.target.value as "all" | SocialNetworkKey)
                  }
                >
                  {NETWORK_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="social-filter">
                <span>Content type</span>
                <select
                  value={contentFilter}
                  onChange={(event) =>
                    setContentFilter(event.target.value as "all" | SocialContentType)
                  }
                >
                  {CONTENT_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredPosts.length > 0 ? (
              <div className="social-post-grid">
                {filteredPosts.map((post, index) => (
                  <PostCard
                    key={`${post.network}-${post.publicationDate}-${index}`}
                    post={post}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            ) : (
              <p className="cc-empty">No recent published content matches these filters.</p>
            )}
          </section>

          <section className="social-section">
            <div className="social-section-header">
              <h2>Schedule & cadence</h2>
            </div>
            <div className="social-schedule-grid">
              <JarvisCard title="Upcoming scheduled posts" accent="purple">
                {snapshot.upcomingScheduled.length > 0 ? (
                  <div className="social-scheduled-list">
                    {snapshot.upcomingScheduled.map((post, index) => (
                      <ScheduledCard
                        key={`${post.publicationDate}-${index}`}
                        post={post}
                        timeZone={timeZone}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="cc-empty">No upcoming posts scheduled</p>
                )}
              </JarvisCard>
              <JarvisCard title="Best posting times" accent="blue">
                <div className="social-best-times-list">
                  {snapshot.bestTimes.map((entry) => (
                    <div key={entry.network} className="social-best-times-item">
                      <h3>{NETWORK_DISPLAY_NAMES[entry.network]}</h3>
                      {entry.available && entry.slots.length > 0 ? (
                        <ul>
                          {entry.slots.slice(0, 3).map((slot) => (
                            <li key={`${slot.dayOfWeek}-${slot.hourOfDay}`}>
                              Day {slot.dayOfWeek}, {slot.hourOfDay}:00 · score{" "}
                              {slot.score}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="social-panel-note">
                          {entry.warning ?? "No best-time data returned."}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </JarvisCard>
            </div>
          </section>

          <section className="social-section">
            <div className="social-section-header">
              <h2>Advisor & alerts</h2>
              <p>
                Deterministic alerts come from server-side rules on real Metricool
                data. Ask Melusi Jarvis for analysis and recommendations.
              </p>
            </div>
            <div className="social-advisor-grid">
              <JarvisCard title="Deterministic social alerts" accent="amber">
                <ul className="social-alert-list">
                  {snapshot.alerts.map((alert) => (
                    <li key={alert.id} className="social-alert-item">
                      <span className={alertBadgeClass(alert.category)}>
                        {alert.category}
                      </span>
                      <div>
                        <span className="social-alert-title">{alert.title}</span>
                        <p className="social-alert-detail">{alert.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </JarvisCard>
              <JarvisCard title="Attribution & limitations" accent="blue">
                <p className="social-panel-note">{snapshot.waitlistAttribution.message}</p>
                {snapshot.warnings.length > 0 ? (
                  <ul className="social-limitations-list">
                    {snapshot.warnings.map((warning) => (
                      <li key={warning.id}>{warning.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="social-panel-note">
                    Partial-data warnings will appear here when one connector fails
                    while others succeed.
                  </p>
                )}
                <Link href="/melusi" className="cc-card-link">
                  Ask Melusi Jarvis on the Command Center →
                </Link>
              </JarvisCard>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
