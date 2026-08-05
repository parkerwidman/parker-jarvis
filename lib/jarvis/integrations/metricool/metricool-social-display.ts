import type { SocialNetworkKey } from "./metricool-social-types";

export const NETWORK_ENGAGEMENT_BASIS_LABEL: Record<SocialNetworkKey, string> = {
  instagram: "Engagement by reach",
  facebook: "Engagement by reach",
  linkedin: "Engagement by impressions",
  tiktok: "Video engagement by reach",
  twitter: "Engagement by impressions",
};

export const NETWORK_PRIMARY_FIELDS: Record<SocialNetworkKey, readonly string[]> = {
  instagram: ["reach", "engagementRate", "followerGrowth", "views"],
  facebook: ["reach", "engagementRate", "followersGained", "impressions"],
  linkedin: ["impressions", "engagementRate", "followerGrowth"],
  tiktok: ["views", "engagementRate", "followerGrowth", "reach"],
  twitter: ["impressions", "engagementRate", "follows", "linkClicks"],
};

export const SOCIAL_CAVEATS = {
  commercialOutcomes:
    "Strong social performance does not prove purchases, waitlist signups, or revenue outcomes.",
  networkEngagement:
    "Engagement formulas differ by network. Do not compare engagement rates across platforms as if they use the same basis.",
  contentRanking:
    "Top and weakest content comparisons stay within the same network and content type when enough mature records exist.",
  waitlistAttribution:
    "Metricool does not provide waitlist signup attribution. Website analytics and tracked signup events are not connected yet.",
  bestTimes:
    "Posting-time rankings are relative within each platform only. A “Best” slot on one network does not equal the same audience volume on another.",
  bestTimesWeekdayUnavailable:
    "Weekday labels are unavailable from the current Metricool response.",
} as const;

export function formatBestTimeHour(hourOfDay: number, timeZone: string): string {
  const date = new Date(Date.UTC(2024, 0, 7, hourOfDay, 0, 0));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function bestTimeRankLabel(rank: "best" | "strong" | "good"): string {
  switch (rank) {
    case "best":
      return "Best";
    case "strong":
      return "Strong";
    default:
      return "Good";
  }
}

export function engagementBasisForNetwork(network: SocialNetworkKey): string {
  return NETWORK_ENGAGEMENT_BASIS_LABEL[network];
}

/** Client-safe network display labels for UI filters and rendering. */
export const NETWORK_DISPLAY_NAMES: Record<SocialNetworkKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X",
};
