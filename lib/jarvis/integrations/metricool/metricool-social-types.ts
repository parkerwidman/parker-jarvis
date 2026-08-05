import type { MetricoolSafeConnection } from "./metricool-types";

export type SocialNetworkKey =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "twitter";

export type ComparisonDisplay =
  | { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
  | { kind: "new_activity" }
  | { kind: "unavailable"; reason: string };

export type MetricValue = {
  label: string;
  value: number | null;
  formatted: string;
  comparison: ComparisonDisplay | null;
  definition?: string;
  unavailable?: boolean;
};

export type NetworkPerformanceSnapshot = {
  network: SocialNetworkKey;
  displayName: string;
  available: boolean;
  limitedData: boolean;
  limitedDataReason: string | null;
  engagementDenominator: string;
  metrics: MetricValue[];
  warnings: string[];
};

export type SocialContentType =
  | "post"
  | "carousel"
  | "image"
  | "reel"
  | "story"
  | "video"
  | "other";

export type RecentSocialPost = {
  network: SocialNetworkKey;
  publicationDate: string;
  postType: SocialContentType;
  caption: string;
  permalink: string | null;
  mediaPreviewUrl: string | null;
  reach: number | null;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagementRate: number | null;
  engagementContext: string | null;
  avgWatchTime: number | null;
  totalWatchTime: number | null;
  postAgeDays: number;
};

export type TopContentHighlight = {
  network: SocialNetworkKey;
  postType: SocialContentType;
  caption: string;
  permalink: string | null;
  metricLabel: string;
  metricValue: string;
  publicationDate: string;
  note: string;
};

export type ScheduledSocialPost = {
  publicationDate: string;
  timezone: string;
  networks: SocialNetworkKey[];
  draft: boolean;
  autoPublish: boolean | null;
  postType: SocialContentType;
  caption: string;
  mediaPreviewUrl: string | null;
  statusLabel: string;
};

export type BestPostingTimeSlot = {
  dayOfWeek: number;
  hourOfDay: number;
  score: number;
};

export type NetworkBestTimes = {
  network: SocialNetworkKey;
  available: boolean;
  slots: BestPostingTimeSlot[];
  warning: string | null;
};

export type CadencePace = "on_pace" | "behind" | "ahead";

export type PostingCadenceStatus = {
  staticTarget: number;
  staticActual: number;
  reelTarget: number;
  reelActual: number;
  staticPace: CadencePace;
  reelPace: CadencePace;
  countingMethod: "unique_content" | "platform_publications";
  limitations: string[];
};

export type SocialAlertCategory = "error" | "warning" | "opportunity" | "information";

export type SocialAlert = {
  id: string;
  category: SocialAlertCategory;
  title: string;
  detail: string;
};

export type PartialDataWarning = {
  id: string;
  message: string;
};

export type SocialDashboardConnection = {
  status: MetricoolSafeConnection["status"];
  brandLabel: string | null;
  connectedNetworks: string[];
  lastVerifiedAt: string | null;
};

export type SocialCommandCenterSnapshot = {
  connection: SocialDashboardConnection;
  refreshedAt: string | null;
  refreshFailed: boolean;
  readOnly: true;
  reportingTimezone: string;
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  recentContentPeriodLabel: string;
  upcomingSchedulePeriodLabel: string;
  limitedHistory: boolean;
  limitedHistoryDetail: string | null;
  waitlistAttribution: {
    connected: false;
    message: string;
  };
  networks: NetworkPerformanceSnapshot[];
  recentPosts: RecentSocialPost[];
  topPerforming: TopContentHighlight | null;
  weakestMature: TopContentHighlight | null;
  upcomingScheduled: ScheduledSocialPost[];
  cadence: PostingCadenceStatus;
  bestTimes: NetworkBestTimes[];
  alerts: SocialAlert[];
  warnings: PartialDataWarning[];
};

export type SocialPerformanceFocus =
  | "overview"
  | "network"
  | "content"
  | "schedule"
  | "alerts";

export type SocialCommandCenterSummary = {
  connectionStatus: MetricoolSafeConnection["status"];
  cadenceStaticPace: CadencePace | null;
  cadenceReelPace: CadencePace | null;
  alertCount: number;
  recentPublicationCount: number;
  upcomingScheduledCount: number;
  refreshedAt: string | null;
};

export type SocialDashboardLoadResult =
  | { ok: true; snapshot: SocialCommandCenterSnapshot }
  | {
      ok: false;
      connection: SocialDashboardConnection;
      errorCode: string;
      message: string;
    };
