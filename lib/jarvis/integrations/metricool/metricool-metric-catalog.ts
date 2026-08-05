import "server-only";

import type { SocialNetworkKey } from "./metricool-social-types";

export type { SocialNetworkKey };

export type MetricConnector = "evolution" | "posts" | "reels" | "stories" | "tw";

/** Melusi posting strategy targets — editable configuration, not analytics facts. */
export const MELUSI_CADENCE_TARGETS = {
  staticPostsPerWeek: 4,
  reelsPerWeek: 3,
} as const;

export type NetworkEvolutionMetrics = {
  metrics: readonly string[];
  /** Index in returned row (excluding trailing date column) → field key */
  fields: readonly string[];
};

export type NetworkPostMetrics = {
  connector: MetricConnector;
  metrics: readonly string[];
  fields: readonly string[];
};

export const INSTAGRAM_EVOLUTION: NetworkEvolutionMetrics = {
  metrics: ["IGEV01", "IGEV03", "IGEV06", "IGEV05", "IGEV04", "IGEV9999"],
  fields: [
    "followers",
    "followerGrowth",
    "reach",
    "views",
    "postCount",
    "engagementRate",
  ],
};

export const FACEBOOK_EVOLUTION: NetworkEvolutionMetrics = {
  metrics: ["FBEV17", "FBEV47", "FBEV48", "FBEV11", "FBEV12", "FBEV9999"],
  fields: [
    "followers",
    "followersGained",
    "followersLost",
    "reach",
    "impressions",
    "engagementRate",
  ],
};

export const LINKEDIN_EVOLUTION: NetworkEvolutionMetrics = {
  metrics: ["LIEV01", "LIEV08", "LIEV18", "LIEV9998"],
  fields: ["followers", "followerGrowth", "impressions", "engagementRate"],
};

export const TIKTOK_EVOLUTION: NetworkEvolutionMetrics = {
  metrics: ["TKEV07", "TKEV08", "TKEV02", "TKEV11", "TKEV9998"],
  fields: ["followers", "followerGrowth", "views", "reach", "engagementRate"],
};

export const TWITTER_EVOLUTION: NetworkEvolutionMetrics = {
  metrics: [
    "TTEV01",
    "TTEV03",
    "TTEV04",
    "TTEV11",
    "TTEV9998",
    "TTEV12",
    "TTEV13",
    "TTEV14",
  ],
  fields: [
    "followers",
    "follows",
    "unfollows",
    "impressions",
    "engagementRate",
    "linkClicks",
    "profileClicks",
    "videoViews",
  ],
};

export const NETWORK_EVOLUTION_CATALOG: Record<
  SocialNetworkKey,
  NetworkEvolutionMetrics
> = {
  instagram: INSTAGRAM_EVOLUTION,
  facebook: FACEBOOK_EVOLUTION,
  linkedin: LINKEDIN_EVOLUTION,
  tiktok: TIKTOK_EVOLUTION,
  twitter: TWITTER_EVOLUTION,
};

export const INSTAGRAM_POSTS: NetworkPostMetrics = {
  connector: "posts",
  metrics: [
    "IGPO04",
    "IGPO03",
    "IGPO05",
    "IGPO14",
    "IGPO28",
    "IGPO13",
    "IGPO08",
    "IGPO27",
    "IGPO15",
    "IGPO10",
  ],
  fields: [
    "postId",
    "caption",
    "mediaUrl",
    "reach",
    "views",
    "likes",
    "comments",
    "saves",
    "shares",
    "engagementRate",
  ],
};

export const INSTAGRAM_REELS: NetworkPostMetrics = {
  connector: "reels",
  metrics: [
    "IGRE04",
    "IGRE03",
    "IGRE11",
    "IGRE23",
    "IGRE10",
    "IGRE08",
    "IGRE07",
    "IGRE24",
    "IGRE25",
  ],
  fields: [
    "postId",
    "caption",
    "reach",
    "views",
    "likes",
    "comments",
    "shares",
    "engagementRate",
    "avgWatchTime",
    "totalWatchTime",
  ],
};

export const INSTAGRAM_STORIES: NetworkPostMetrics = {
  connector: "stories",
  metrics: ["IGST04", "IGST03", "IGST11", "IGST08"],
  fields: ["storyId", "caption", "impressions", "reach"],
};

export const FACEBOOK_POSTS: NetworkPostMetrics = {
  connector: "posts",
  metrics: [
    "FBPO04",
    "FBPO03",
    "FBPO05",
    "FBPO12",
    "FBPO11",
    "FBPO13",
    "FBPO08",
    "FBPO14",
    "FBPO09",
    "FBPO10",
  ],
  fields: [
    "postId",
    "caption",
    "mediaUrl",
    "reach",
    "impressions",
    "reactions",
    "comments",
    "shares",
    "linkClicks",
    "engagementRate",
  ],
};

export const FACEBOOK_REELS: NetworkPostMetrics = {
  connector: "reels",
  metrics: [
    "FBRE04",
    "FBRE03",
    "FBRE11",
    "FBRE10",
    "FBRE08",
    "FBRE07",
  ],
  fields: [
    "postId",
    "caption",
    "reach",
    "views",
    "reactions",
    "comments",
    "shares",
  ],
};

export const LINKEDIN_POSTS: NetworkPostMetrics = {
  connector: "posts",
  metrics: [
    "LIPO06",
    "LIPO04",
    "LIPO07",
    "LIPO12",
    "LIPO13",
    "LIPO10",
    "LIPO18",
    "LIPO09",
    "LIPO9999",
  ],
  fields: [
    "postId",
    "caption",
    "mediaUrl",
    "impressions",
    "reactions",
    "comments",
    "shares",
    "clicks",
    "engagementRate",
  ],
};

export const TIKTOK_POSTS: NetworkPostMetrics = {
  connector: "posts",
  metrics: [
    "TKPO03",
    "TKPO05",
    "TKPO04",
    "TKPO11",
    "TKPO07",
    "TKPO08",
    "TKPO09",
    "TKPO10",
    "TKPO9999",
    "TKPO14",
    "TKPO15",
    "TKPO13",
  ],
  fields: [
    "postId",
    "caption",
    "mediaUrl",
    "reach",
    "views",
    "likes",
    "comments",
    "shares",
    "engagementRate",
    "totalWatchTime",
    "avgWatchTime",
    "fullVideoWatchedRate",
  ],
};

export const TWITTER_POSTS: NetworkPostMetrics = {
  connector: "tw",
  metrics: [
    "TTTW04",
    "TTTW03",
    "TTTW11",
    "TTTW05",
    "TTTW08",
    "TTTW06",
    "TTTW07",
    "TTTW13",
    "TTTW10",
    "TTTW12",
  ],
  fields: [
    "postId",
    "caption",
    "impressions",
    "likes",
    "replies",
    "reposts",
    "linkClicks",
    "engagementRate",
    "profileClicks",
    "videoViews",
  ],
};

export const NETWORK_POST_CATALOG: Record<
  SocialNetworkKey,
  NetworkPostMetrics
> = {
  instagram: INSTAGRAM_POSTS,
  facebook: FACEBOOK_POSTS,
  linkedin: LINKEDIN_POSTS,
  tiktok: TIKTOK_POSTS,
  twitter: TWITTER_POSTS,
};

/** Cross-network content discovery via brandSummary/posts. */
export const BRAND_SUMMARY_POSTS = {
  metrics: [
    "BSPO01",
    "BSPO02",
    "BSPO05",
    "BSPO06",
    "BSPO07",
    "BSPO08",
    "BSPO09",
    "BSPO03",
  ],
  fields: [
    "network",
    "publicationDate",
    "text",
    "impressions",
    "interactions",
    "postType",
    "engagementRate",
    "permalink",
  ],
} as const;

export const NETWORK_ENGAGEMENT_DENOMINATOR: Record<SocialNetworkKey, string> = {
  instagram: "per 1,000 people reached",
  facebook: "per 1,000 people reached",
  linkedin: "per impressions",
  tiktok: "per people reached",
  twitter: "per impressions",
};

export const TRUSTED_NETWORK_FILTER_VALUES = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "twitter",
] as const;

export type TrustedNetworkFilter =
  (typeof TRUSTED_NETWORK_FILTER_VALUES)[number];

export function isTrustedNetworkFilter(
  value: string,
): value is TrustedNetworkFilter {
  return (TRUSTED_NETWORK_FILTER_VALUES as readonly string[]).includes(value);
}

export function normalizeBrandSummaryNetwork(
  value: string,
): SocialNetworkKey | null {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "instagram":
      return "instagram";
    case "facebook":
      return "facebook";
    case "linkedin":
      return "linkedin";
    case "tiktok":
      return "tiktok";
    case "twitter":
    case "x":
      return "twitter";
    default:
      return null;
  }
}
