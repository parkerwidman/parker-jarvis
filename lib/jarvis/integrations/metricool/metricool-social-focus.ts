import "server-only";

import { EXPECTED_CONNECTED_NETWORKS } from "./metricool-config";
import { NETWORK_DISPLAY_NAMES } from "./metricool-social-display";
import type {
  NetworkPerformanceSnapshot,
  PostingCadenceStatus,
  ScheduledSocialPost,
  SocialAlert,
  SocialCommandCenterSnapshot,
  SocialFocus,
  SocialFocusCategory,
  TopContentHighlight,
} from "./metricool-social-types";
import type { MetricoolSafeConnection } from "./metricool-types";

function focusCategoryFromAlert(category: SocialAlert["category"]): SocialFocusCategory {
  switch (category) {
    case "error":
      return "urgent";
    case "warning":
      return "warning";
    case "opportunity":
      return "opportunity";
    default:
      return "information";
  }
}

function noUrgentFocus(): SocialFocus {
  return {
    category: "information",
    title: "No urgent social issue",
    explanation: "Cadence, schedule, and network data look manageable for now.",
    nextAction: "No immediate action required.",
    platform: null,
    contentType: null,
    sectionAnchor: null,
  };
}

function topPerformingFocus(top: TopContentHighlight): SocialFocus {
  return {
    category: "opportunity",
    title: "Strong recent content on " + NETWORK_DISPLAY_NAMES[top.network],
    explanation: `${top.postType} outperformed comparable mature ${NETWORK_DISPLAY_NAMES[top.network]} content by ${top.metricLabel}.`,
    nextAction: `Review the top-performing ${NETWORK_DISPLAY_NAMES[top.network]} ${top.postType}.`,
    platform: top.network,
    contentType: top.postType,
    sectionAnchor: "#social-content-performance",
  };
}

function weakestMatureFocus(weakest: TopContentHighlight): SocialFocus {
  return {
    category: "information",
    title: "One mature post underperformed peers",
    explanation: `${NETWORK_DISPLAY_NAMES[weakest.network]} ${weakest.postType} ranked lowest among comparable mature posts by ${weakest.metricLabel}.`,
    nextAction: "Review the underperforming post for learning, not as a commercial verdict.",
    platform: weakest.network,
    contentType: weakest.postType,
    sectionAnchor: "#social-content-performance",
  };
}

function firstUnavailableNetwork(
  networks: NetworkPerformanceSnapshot[],
): NetworkPerformanceSnapshot | null {
  for (const networkKey of EXPECTED_CONNECTED_NETWORKS) {
    const network = networks.find((item) => item.network === networkKey);
    if (network && !network.available) {
      return network;
    }
  }

  return null;
}

function scheduledWithinSevenDays(posts: ScheduledSocialPost[]): ScheduledSocialPost[] {
  const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return posts.filter(
    (post) => new Date(post.publicationDate).getTime() <= horizon,
  );
}

export function selectSocialFocus(input: {
  connectionStatus: MetricoolSafeConnection["status"];
  analyticsUnavailable: boolean;
  cadence: PostingCadenceStatus;
  networks: NetworkPerformanceSnapshot[];
  upcomingScheduled: ScheduledSocialPost[];
  topPerforming: TopContentHighlight | null;
  weakestMature: TopContentHighlight | null;
  alerts: SocialAlert[];
}): SocialFocus {
  if (
    input.connectionStatus === "reconnect_required" ||
    input.connectionStatus === "error"
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

  if (input.analyticsUnavailable) {
    return {
      category: "urgent",
      title: "Social analytics unavailable",
      explanation:
        "The latest analytics refresh failed. Connection status is preserved, but performance sections are hidden to avoid false zeros.",
      nextAction: "Retry refresh after verifying Metricool access.",
      platform: null,
      contentType: null,
      sectionAnchor: "#social-connection",
    };
  }

  if (scheduledWithinSevenDays(input.upcomingScheduled).length === 0) {
    return {
      category: "warning",
      title: "No content scheduled for the next seven days",
      explanation: "The upcoming schedule is empty for the next week.",
      nextAction: "Review the upcoming schedule.",
      platform: null,
      contentType: null,
      sectionAnchor: "#social-schedule",
    };
  }

  if (input.cadence.reelPace === "behind") {
    return {
      category: "warning",
      title: "Reel cadence is behind target",
      explanation: `${input.cadence.reelActual} of ${input.cadence.reelTarget} Reels or short-form videos in the last seven completed days.`,
      nextAction: "Prepare the next Reel.",
      platform: "instagram",
      contentType: "reel",
      sectionAnchor: "#social-schedule",
    };
  }

  if (input.cadence.staticPace === "behind") {
    return {
      category: "warning",
      title: "Static post cadence is behind target",
      explanation: `${input.cadence.staticActual} of ${input.cadence.staticTarget} static posts in the last seven completed days.`,
      nextAction: "Prepare the next static post.",
      platform: null,
      contentType: "post",
      sectionAnchor: "#social-schedule",
    };
  }

  const unavailableNetwork = firstUnavailableNetwork(input.networks);
  if (unavailableNetwork) {
    return {
      category: "warning",
      title: `${unavailableNetwork.displayName} analytics unavailable`,
      explanation:
        unavailableNetwork.limitedDataReason ??
        "This network returned no usable analytics for the current period.",
      nextAction: `Review ${unavailableNetwork.displayName} limitations below.`,
      platform: unavailableNetwork.network,
      contentType: null,
      sectionAnchor: "#social-network-performance",
    };
  }

  if (input.topPerforming) {
    return topPerformingFocus(input.topPerforming);
  }

  if (input.weakestMature) {
    return weakestMatureFocus(input.weakestMature);
  }

  const opportunityAlert = input.alerts.find(
    (alert) => alert.category === "opportunity",
  );
  if (opportunityAlert) {
    return {
      category: focusCategoryFromAlert(opportunityAlert.category),
      title: opportunityAlert.title,
      explanation: opportunityAlert.detail,
      nextAction: "Review the related content or schedule section.",
      platform: null,
      contentType: null,
      sectionAnchor: "#social-alerts",
    };
  }

  return noUrgentFocus();
}

export function buildSocialFocusFromSnapshot(
  snapshot: SocialCommandCenterSnapshot,
  connectionStatus: MetricoolSafeConnection["status"],
  analyticsUnavailable: boolean,
): SocialFocus {
  return selectSocialFocus({
    connectionStatus,
    analyticsUnavailable,
    cadence: snapshot.cadence,
    networks: snapshot.networks,
    upcomingScheduled: snapshot.upcomingScheduled,
    topPerforming: snapshot.topPerforming,
    weakestMature: snapshot.weakestMature,
    alerts: snapshot.alerts,
  });
}
