"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  SocialAlert,
  SocialCommandCenterSnapshot,
  SocialContentType,
  SocialFocus,
  SocialNetworkKey,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import type { MetricoolSafeConnection } from "@/lib/jarvis/integrations/metricool/metricool-types";
import { SOCIAL_CAVEATS } from "@/lib/jarvis/integrations/metricool/metricool-social-display";
import { MetricoolConnectionActions } from "@/components/melusi/metricool-connection-panel";
import { JarvisAlert } from "@/components/jarvis/jarvis-ui";
import { SocialFocusSection } from "@/components/melusi/social/social-focus-section";
import { SocialSummaryStrip } from "@/components/melusi/social/social-summary-strip";
import { SocialNetworkCard } from "@/components/melusi/social/social-network-card";
import { SocialGroupedContentList } from "@/components/melusi/social/social-grouped-content-list";
import {
  SocialBestTimesPanel,
  SocialContentHighlights,
  SocialScheduleList,
} from "@/components/melusi/social/social-content-sections";
import { SocialInfoDisclosure } from "@/components/melusi/social/social-info-disclosure";

type SocialCommandCenterProps = {
  connection: MetricoolSafeConnection;
  snapshot: SocialCommandCenterSnapshot | null;
  loadError: string | null;
  timeZone: string;
  canVerify: boolean;
  canDisconnect: boolean;
  canReconnect: boolean;
  showConnectionRecovery?: boolean;
};

const NETWORK_FILTERS: Array<{ value: "all" | SocialNetworkKey; label: string }> = [
  { value: "all", label: "All networks" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "X" },
];

const CONTENT_FILTERS: Array<{ value: "all" | SocialContentType; label: string }> = [
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

function alertBadgeClass(category: SocialAlert["category"]): string {
  return `social-alert-badge social-alert-badge--${category}`;
}

function ConnectionHealthBadge({
  status,
}: {
  status: MetricoolSafeConnection["status"];
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

  return (
    <span className={`social-status-badge social-status-badge--${status}`}>{label}</span>
  );
}

function resolveClientSocialFocus(
  connection: MetricoolSafeConnection,
  snapshot: SocialCommandCenterSnapshot | null,
  analyticsUnavailable: boolean,
): SocialFocus {
  if (snapshot?.socialFocus) {
    return snapshot.socialFocus;
  }

  if (
    connection.status === "reconnect_required" ||
    connection.status === "error"
  ) {
    return {
      category: "urgent",
      title: "Metricool reconnection required",
      explanation:
        "Live social analytics cannot refresh until Metricool authorization is restored.",
      nextAction: "Reconnect Metricool.",
      platform: null,
      contentType: null,
      sectionAnchor: "#social-connection",
    };
  }

  if (analyticsUnavailable) {
    return {
      category: "urgent",
      title: "Social analytics unavailable",
      explanation: "The latest analytics refresh failed.",
      nextAction: "Retry refresh after verifying Metricool access.",
      platform: null,
      contentType: null,
      sectionAnchor: "#social-connection",
    };
  }

  return {
    category: "information",
    title: "Connect Metricool to load social analytics",
    explanation: "Network performance, grouped content, and schedule data appear after verification.",
    nextAction: "Connect Metricool.",
    platform: null,
    contentType: null,
    sectionAnchor: "#social-connection",
  };
}

export function SocialCommandCenter({
  connection,
  snapshot,
  loadError,
  timeZone,
  canVerify,
  canDisconnect,
  canReconnect,
  showConnectionRecovery = false,
}: SocialCommandCenterProps) {
  const router = useRouter();
  const [networkFilter, setNetworkFilter] = useState<"all" | SocialNetworkKey>("all");
  const [contentFilter, setContentFilter] = useState<"all" | SocialContentType>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [limitationsOpen, setLimitationsOpen] = useState(false);

  const isConnected = connection.status === "connected";
  const isConnecting = connection.status === "connecting";
  const needsReconnect =
    connection.status === "reconnect_required" || connection.status === "error";
  const showInterruptedConnection = showConnectionRecovery && isConnecting;
  const analyticsUnavailable = Boolean(
    isConnected && (loadError || snapshot?.refreshFailed),
  );
  const analyticsLoaded = Boolean(
    isConnected && snapshot && !snapshot.refreshFailed,
  );

  const importantAlerts = useMemo(
    () =>
      snapshot?.alerts.filter(
        (alert) => alert.category === "error" || alert.category === "warning",
      ) ?? [],
    [snapshot],
  );

  const visibleAlerts = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.alerts.filter((alert) => {
      if (alert.category === "error" || alert.category === "warning") {
        return true;
      }

      if (alert.category === "opportunity") {
        return true;
      }

      return alert.id === "waitlist-not-connected";
    });
  }, [snapshot]);

  const socialFocus = resolveClientSocialFocus(
    connection,
    snapshot,
    analyticsUnavailable,
  );

  async function handleRecoverConnection() {
    if (recovering) {
      return;
    }

    setRecovering(true);
    setRecoveryError(null);

    try {
      const response = await fetch("/api/integrations/metricool/recover", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok && payload.error === "not_recoverable") {
        setRecoveryError("This Metricool connection is not in a recoverable state.");
        return;
      }

      router.refresh();
    } catch {
      setRecoveryError("Could not recover the saved Metricool connection.");
    } finally {
      setRecovering(false);
    }
  }

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

  return (
    <div className="social-command-center">
      <header className="social-header melusi-subpage-header">
        <div className="social-header-copy">
          <div className="social-header-title-row">
            <h1 className="melusi-dash-title">
              Social <span>Command Center</span>
            </h1>
            <span className="social-readonly-badge">Read-only</span>
            <ConnectionHealthBadge status={connection.status} />
          </div>
          <p className="melusi-dash-descriptor">
            Live Metricool analytics for Melusi&apos;s trusted brand
          </p>
          {analyticsLoaded && snapshot?.refreshedAt ? (
            <p className="social-header-refreshed">
              Last refreshed {formatDateTime(snapshot.refreshedAt, timeZone)}
            </p>
          ) : null}
        </div>
        <div className="social-header-actions">
          <button
            type="button"
            className="jv-btn jv-btn--secondary"
            onClick={handleRefresh}
            disabled={refreshing || !isConnected}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {loadError ? <JarvisAlert variant="error">{loadError}</JarvisAlert> : null}
      {refreshError ? <JarvisAlert variant="error">{refreshError}</JarvisAlert> : null}
      {snapshot?.limitedHistory && snapshot.limitedHistoryDetail && analyticsLoaded ? (
        <JarvisAlert variant="info">{snapshot.limitedHistoryDetail}</JarvisAlert>
      ) : null}

      <SocialFocusSection focus={socialFocus} />

      {analyticsLoaded && snapshot ? (
        <SocialSummaryStrip
          cadence={snapshot.cadence}
          groupedContent={snapshot.groupedRecentContent}
          upcomingScheduled={snapshot.upcomingScheduled}
          alertCount={importantAlerts.length}
          connectionStatus={connection.status}
        />
      ) : null}

      {analyticsUnavailable ? (
        <section className="social-unavailable-state">
          <h2>Analytics unavailable</h2>
          <p>
            Social analytics could not be loaded. Connection status is shown below.
            Retry refresh after verifying Metricool access — performance sections stay
            hidden so failed data is not shown as zero performance.
          </p>
        </section>
      ) : null}

      {!analyticsLoaded && !analyticsUnavailable && !isConnecting ? (
        <section className="social-unavailable-state social-unavailable-state--quiet">
          <h2>Social analytics not connected</h2>
          <p>Connect and verify Metricool to load network performance and schedule data.</p>
        </section>
      ) : null}

      {analyticsLoaded && snapshot ? (
        <div className="social-main-layout">
          <section
            className="social-section social-section--primary"
            id="social-content-performance"
          >
            <div className="social-section-header">
              <h2>Content performance</h2>
              <p>{snapshot.recentContentPeriodLabel}</p>
            </div>
            <SocialContentHighlights
              topPerforming={snapshot.topPerforming}
              weakestMature={snapshot.weakestMature}
            />
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
            <SocialGroupedContentList
              groups={snapshot.groupedRecentContent}
              timeZone={timeZone}
              networkFilter={networkFilter}
              contentFilter={contentFilter}
            />
          </section>

          <section className="social-section social-section--primary" id="social-schedule">
            <div className="social-section-header">
              <h2>Upcoming schedule</h2>
              <p>{snapshot.upcomingSchedulePeriodLabel}</p>
            </div>
            <SocialScheduleList posts={snapshot.upcomingScheduled} timeZone={timeZone} />
          </section>

          <section className="social-section social-section--secondary" id="social-network-performance">
            <div className="social-section-header">
              <h2>Network performance</h2>
              <p>
                {snapshot.currentPeriodLabel} vs {snapshot.comparisonPeriodLabel}
              </p>
            </div>
            <div className="social-network-grid">
              {snapshot.networks.map((network) => (
                <SocialNetworkCard key={network.network} network={network} />
              ))}
            </div>
          </section>

          <section className="social-section social-section--secondary" id="social-best-times">
            <div className="social-section-header">
              <h2>Best posting times</h2>
            </div>
            <SocialBestTimesPanel bestTimes={snapshot.bestTimes} />
          </section>

          <section className="social-section social-section--footer" id="social-alerts">
            <div className="social-section-header">
              <h2>Alerts & limitations</h2>
            </div>
            <ul className="social-alert-list">
              {visibleAlerts.map((alert) => (
                <li key={alert.id} className="social-alert-item">
                  <span className={alertBadgeClass(alert.category)}>{alert.category}</span>
                  <div>
                    <span className="social-alert-title">{alert.title}</span>
                    <p className="social-alert-detail">{alert.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            {snapshot.warnings.length > 0 ? (
              <div className="social-limitations-disclosure">
                <button
                  type="button"
                  className="social-expand-btn"
                  aria-expanded={limitationsOpen}
                  onClick={() => setLimitationsOpen((value) => !value)}
                >
                  {limitationsOpen
                    ? "Hide partial-data details"
                    : `Show ${snapshot.warnings.length} partial-data notice${snapshot.warnings.length === 1 ? "" : "s"}`}
                </button>
                {limitationsOpen ? (
                  <ul className="social-limitations-list">
                    {snapshot.warnings.map((warning) => (
                      <li key={warning.id}>{warning.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <p className="social-section-footnote">
              {snapshot.waitlistAttribution.message}
              <SocialInfoDisclosure
                label="Waitlist attribution"
                content={SOCIAL_CAVEATS.waitlistAttribution}
              />
              {" · "}
              <SocialInfoDisclosure
                label="Social vs commercial outcomes"
                content={SOCIAL_CAVEATS.commercialOutcomes}
              />
            </p>

            <Link href="/melusi" className="cc-card-link">
              Ask Melusi Jarvis on the Command Center →
            </Link>
          </section>
        </div>
      ) : null}

      <section className="social-connection-compact" id="social-connection">
        <div className="social-connection-compact-main">
          <h2>Metricool connection</h2>
          {isConnected ? (
            <p className="social-connection-copy">
              Verified read-only access for {connection.brandLabel ?? "melusiai"}.
              {connection.connectedNetworks.length > 0
                ? ` ${connection.connectedNetworks.length} connected network${connection.connectedNetworks.length === 1 ? "" : "s"}.`
                : null}
            </p>
          ) : showInterruptedConnection ? (
            <p className="social-connection-copy">
              The previous Metricool authorization did not finish. Check whether your
              saved connection is still valid before reconnecting.
            </p>
          ) : isConnecting ? (
            <p className="social-connection-copy">
              OAuth authorization is in progress. Complete Metricool sign-in if prompted.
            </p>
          ) : needsReconnect ? (
            <p className="social-connection-copy">
              Metricool authorization needs to be renewed before analytics can refresh.
            </p>
          ) : (
            <p className="social-connection-copy">
              Connect Metricool to load live social analytics for the trusted Melusi brand.
            </p>
          )}
        </div>
        <div className="social-connection-compact-actions">
          <MetricoolConnectionActions
            canVerify={canVerify}
            canDisconnect={canDisconnect}
            canReconnect={canReconnect}
            canRecover={showInterruptedConnection}
            onRecover={handleRecoverConnection}
            recoverPending={recovering}
          />
          {connection.status === "disconnected" ? (
            <a
              href="/api/integrations/metricool/connect"
              className="jv-btn jv-btn--primary jv-btn--inline"
            >
              Connect Metricool
            </a>
          ) : null}
          {recoveryError ? (
            <p className="jv-connection-meta jv-connection-meta--error">{recoveryError}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
