"use client";

import type {
  GroupedCoreContent,
  PostingCadenceStatus,
  ScheduledSocialPost,
} from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import type { MetricoolSafeConnection } from "@/lib/jarvis/integrations/metricool/metricool-types";

type SocialSummaryStripProps = {
  cadence: PostingCadenceStatus;
  groupedContent: GroupedCoreContent[];
  upcomingScheduled: ScheduledSocialPost[];
  alertCount: number;
  connectionStatus: MetricoolSafeConnection["status"];
};

function scheduledWithinSevenDays(posts: ScheduledSocialPost[]): number {
  const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return posts.filter(
    (post) => new Date(post.publicationDate).getTime() <= horizon,
  ).length;
}

function cadenceSummary(cadence: PostingCadenceStatus): {
  label: string;
  tone: "warning" | "healthy" | "neutral";
} {
  if (cadence.reelPace === "behind") {
    return { label: "Behind Reel target", tone: "warning" };
  }

  if (cadence.staticPace === "behind") {
    return { label: "Behind static target", tone: "warning" };
  }

  if (cadence.reelPace === "ahead" || cadence.staticPace === "ahead") {
    return { label: "Ahead of cadence", tone: "healthy" };
  }

  return { label: "On cadence", tone: "healthy" };
}

function connectionSummary(status: MetricoolSafeConnection["status"]): {
  label: string;
  tone: "error" | "healthy" | "neutral" | "warning";
} {
  switch (status) {
    case "connected":
      return { label: "Metricool verified", tone: "healthy" };
    case "reconnect_required":
    case "error":
      return { label: "Reconnect required", tone: "error" };
    case "connecting":
      return { label: "Connecting", tone: "warning" };
    default:
      return { label: "Not connected", tone: "neutral" };
  }
}

export function SocialSummaryStrip({
  cadence,
  groupedContent,
  upcomingScheduled,
  alertCount,
  connectionStatus,
}: SocialSummaryStripProps) {
  const cadenceCell = cadenceSummary(cadence);
  const connectionCell = connectionSummary(connectionStatus);
  const scheduledCount = scheduledWithinSevenDays(upcomingScheduled);

  return (
    <section className="social-summary-strip" aria-label="Social summary">
      <div className={`social-summary-cell social-summary-cell--${cadenceCell.tone}`}>
        <span>Cadence</span>
        <strong>{cadenceCell.label}</strong>
      </div>
      <div className="social-summary-cell social-summary-cell--healthy">
        <span>Recent content</span>
        <strong>
          {groupedContent.length} core content piece
          {groupedContent.length === 1 ? "" : "s"}
        </strong>
      </div>
      <div
        className={`social-summary-cell social-summary-cell--${scheduledCount === 0 ? "warning" : "neutral"}`}
      >
        <span>Upcoming</span>
        <strong>{scheduledCount} scheduled next 7 days</strong>
      </div>
      <div
        className={`social-summary-cell social-summary-cell--${alertCount > 0 ? "warning" : "neutral"}`}
      >
        <span>Alerts</span>
        <strong>
          {alertCount} need attention
        </strong>
      </div>
      <div className={`social-summary-cell social-summary-cell--${connectionCell.tone}`}>
        <span>Connection</span>
        <strong>{connectionCell.label}</strong>
      </div>
    </section>
  );
}
