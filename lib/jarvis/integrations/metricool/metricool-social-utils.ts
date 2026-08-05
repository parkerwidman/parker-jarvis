import "server-only";

import {
  METRICOOL_BRAND_HISTORY_START,
  TRUSTED_BRAND_TIMEZONE,
} from "./metricool-config";
import type {
  ComparisonDisplay,
  RecentSocialPost,
  SocialContentType,
} from "./metricool-social-types";
import {
  normalizeBrandSummaryNetwork,
} from "./metricool-metric-catalog";
import type { SocialNetworkKey } from "./metricool-social-types";

const CHICAGO_OFFSET = "-05:00";

export function truncateCaption(text: string, maxLength = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

export function parseAnalyticsRows(payload: unknown): unknown[][] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const rows = record.rows;

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter((row): row is unknown[] => Array.isArray(row));
}

export function parseScheduledPosts(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data;
}

export function parseBestTimes(payload: unknown): Array<{
  dayOfWeek: number;
  providerWeekdayName: string | null;
  bestTimesByHour: Array<{ hourOfDay: number; value: number }>;
}> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;

  if (!Array.isArray(data)) {
    return [];
  }

  const result: Array<{
    dayOfWeek: number;
    providerWeekdayName: string | null;
    bestTimesByHour: Array<{ hourOfDay: number; value: number }>;
  }> = [];

  for (const entry of data) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const item = entry as Record<string, unknown>;
    const dayOfWeek = Number(item.dayOfWeek);
    const hours = item.bestTimesByHour;

    if (!Number.isFinite(dayOfWeek) || !Array.isArray(hours)) {
      continue;
    }

    const bestTimesByHour: Array<{ hourOfDay: number; value: number }> = [];

    for (const hourEntry of hours) {
      if (!hourEntry || typeof hourEntry !== "object") {
        continue;
      }

      const hourRecord = hourEntry as Record<string, unknown>;
      const hourOfDay = Number(hourRecord.hourOfDay);
      const value = Number(hourRecord.value);

      if (Number.isFinite(hourOfDay) && Number.isFinite(value)) {
        bestTimesByHour.push({ hourOfDay, value });
      }
    }

    result.push({
      dayOfWeek,
      providerWeekdayName: parseProviderWeekdayName(item),
      bestTimesByHour,
    });
  }

  return result;
}

function parseProviderWeekdayName(item: Record<string, unknown>): string | null {
  for (const key of ["dayName", "weekday", "weekDay", "name"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const dayValue = item.day;
  if (typeof dayValue === "string" && dayValue.trim().length > 0 && !/^\d+$/.test(dayValue.trim())) {
    return dayValue.trim();
  }

  return null;
}

export function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function formatInteger(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatDecimal(value: number | null, digits = 1): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercentChange(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return `${rounded}%`;
}

export function buildComparison(
  current: number | null,
  previous: number | null,
): ComparisonDisplay | null {
  if (current === null || previous === null) {
    return { kind: "unavailable", reason: "Comparison unavailable" };
  }

  if (previous === 0 && current === 0) {
    return { kind: "flat" };
  }

  if (previous === 0 && current > 0) {
    return { kind: "new_activity" };
  }

  if (previous === 0) {
    return { kind: "unavailable", reason: "Comparison unavailable" };
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;

  if (!Number.isFinite(change)) {
    return { kind: "unavailable", reason: "Comparison unavailable" };
  }

  if (Math.abs(change) < 3) {
    return { kind: "flat" };
  }

  return {
    kind: "percent",
    value: change,
    direction: change > 0 ? "up" : "down",
  };
}

export type ReportingWindows = {
  timezone: string;
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  recentFrom: string;
  recentTo: string;
  upcomingFrom: string;
  upcomingTo: string;
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  recentContentPeriodLabel: string;
  upcomingSchedulePeriodLabel: string;
  limitedHistory: boolean;
  limitedHistoryDetail: string | null;
};

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return { year, month, day };
}

function shiftLocalDate(
  year: string,
  month: string,
  day: string,
  deltaDays: number,
): string {
  const utc = new Date(`${year}-${month}-${day}T12:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  return utc.toISOString().slice(0, 10);
}

function formatPeriodLabel(fromIsoDate: string, toIsoDate: string): string {
  const from = new Date(`${fromIsoDate}T12:00:00Z`);
  const to = new Date(`${toIsoDate}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(from)} – ${formatter.format(to)}`;
}

function toChicagoIso(dateIso: string, endOfDay: boolean): string {
  return endOfDay
    ? `${dateIso}T23:59:59${CHICAGO_OFFSET}`
    : `${dateIso}T00:00:00${CHICAGO_OFFSET}`;
}

export function buildReportingWindows(now = new Date()): ReportingWindows {
  const timezone = TRUSTED_BRAND_TIMEZONE;
  const today = getLocalDateParts(now, timezone);
  const yesterday = shiftLocalDate(today.year, today.month, today.day, -1);
  const currentEnd = yesterday;
  const currentStart = shiftLocalDate(
    today.year,
    today.month,
    today.day,
    -7,
  );
  const previousEnd = shiftLocalDate(today.year, today.month, today.day, -8);
  const previousStart = shiftLocalDate(
    today.year,
    today.month,
    today.day,
    -14,
  );
  const recentStart = shiftLocalDate(today.year, today.month, today.day, -30);
  const upcomingEnd = shiftLocalDate(today.year, today.month, today.day, 30);
  const todayIso = `${today.year}-${today.month}-${today.day}`;

  const limitedHistory = previousStart < METRICOOL_BRAND_HISTORY_START;

  return {
    timezone,
    currentFrom: toChicagoIso(currentStart, false),
    currentTo: toChicagoIso(currentEnd, true),
    previousFrom: toChicagoIso(previousStart, false),
    previousTo: toChicagoIso(previousEnd, true),
    recentFrom: toChicagoIso(recentStart, false),
    recentTo: toChicagoIso(currentEnd, true),
    upcomingFrom: toChicagoIso(todayIso, false),
    upcomingTo: toChicagoIso(upcomingEnd, true),
    currentPeriodLabel: formatPeriodLabel(currentStart, currentEnd),
    comparisonPeriodLabel: formatPeriodLabel(previousStart, previousEnd),
    recentContentPeriodLabel: formatPeriodLabel(recentStart, currentEnd),
    upcomingSchedulePeriodLabel: formatPeriodLabel(todayIso, upcomingEnd),
    limitedHistory,
    limitedHistoryDetail: limitedHistory
      ? "Metricool history for Melusi begins in July 2026. Earlier comparison periods may be incomplete."
      : null,
  };
}

export function mapRowToRecord(
  row: unknown[],
  fields: readonly string[],
  hasDateColumn: boolean,
): Record<string, unknown> {
  const valueCount = hasDateColumn ? fields.length : fields.length;
  const record: Record<string, unknown> = {};

  for (let index = 0; index < fields.length; index += 1) {
    record[fields[index]!] = row[index] ?? null;
  }

  if (hasDateColumn && row.length > fields.length) {
    record.date = row[fields.length] ?? null;
  }

  return record;
}

export function aggregateEvolutionMetric(
  rows: unknown[][],
  fieldIndex: number,
  aggregation: "last" | "sum" | "avg",
): number | null {
  const values = rows
    .map((row) => toNumeric(row[fieldIndex]))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  switch (aggregation) {
    case "last":
      return values[values.length - 1] ?? null;
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
  }
}

export function classifyPostType(value: string | null | undefined): SocialContentType {
  if (!value) {
    return "other";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("reel") || normalized.includes("short")) {
    return "reel";
  }

  if (normalized.includes("story")) {
    return "story";
  }

  if (normalized.includes("carousel") || normalized.includes("album")) {
    return "carousel";
  }

  if (normalized.includes("image") || normalized.includes("photo")) {
    return "image";
  }

  if (normalized.includes("video")) {
    return "video";
  }

  if (normalized.includes("post")) {
    return "post";
  }

  return "other";
}

export function isReelOrShortForm(type: SocialContentType): boolean {
  return type === "reel" || type === "video";
}

export function isStaticContent(type: SocialContentType): boolean {
  return type === "post" || type === "carousel" || type === "image";
}

export function parseBrandSummaryDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null;
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10) || "00";
  const minute = value.slice(10, 12) || "00";
  const second = value.slice(12, 14) || "00";

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${CHICAGO_OFFSET}`;
}

export function daysSince(isoDate: string, now = new Date()): number {
  const published = new Date(isoDate).getTime();
  const diffMs = now.getTime() - published;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function mapPostRowToRecentPost(
  network: SocialNetworkKey,
  row: Record<string, unknown>,
  engagementContext: string,
): RecentSocialPost | null {
  const publicationDate =
    typeof row.publicationDate === "string"
      ? row.publicationDate
      : typeof row.publishedAt === "string"
        ? row.publishedAt
        : null;

  if (!publicationDate) {
    return null;
  }

  const caption = truncateCaption(
    typeof row.caption === "string" ? row.caption : String(row.caption ?? ""),
  );

  const postType = classifyPostType(
    typeof row.postType === "string" ? row.postType : undefined,
  );

  const pubDate = publicationDate;

  return {
    network,
    publicationDate: pubDate,
    postType,
    caption,
    permalink:
      typeof row.permalink === "string"
        ? row.permalink
        : typeof row.link === "string"
          ? row.link
          : null,
    mediaPreviewUrl:
      typeof row.mediaUrl === "string" ? row.mediaUrl : null,
    postId:
      typeof row.postId === "string"
        ? row.postId
        : typeof row.postId === "number"
          ? String(row.postId)
          : null,
    plannerId:
      typeof row.plannerId === "string" && row.plannerId.trim().length > 0
        ? row.plannerId.trim()
        : typeof row.plannerUuid === "string" && row.plannerUuid.trim().length > 0
          ? row.plannerUuid.trim()
          : null,
    campaignId:
      typeof row.campaignId === "string" && row.campaignId.trim().length > 0
        ? row.campaignId.trim()
        : typeof row.contentId === "string" && row.contentId.trim().length > 0
          ? row.contentId.trim()
          : null,
    reach: toNumeric(row.reach),
    impressions: toNumeric(row.impressions),
    views: toNumeric(row.views),
    likes: toNumeric(row.likes ?? row.reactions),
    comments: toNumeric(row.comments ?? row.replies),
    shares: toNumeric(row.shares ?? row.reposts),
    saves: toNumeric(row.saves),
    clicks: toNumeric(row.clicks ?? row.linkClicks),
    engagementRate: toNumeric(row.engagementRate),
    engagementContext,
    avgWatchTime: toNumeric(row.avgWatchTime),
    totalWatchTime: toNumeric(row.totalWatchTime),
    postAgeDays: daysSince(pubDate),
  };
}

export function mapBrandSummaryRow(row: unknown[]): RecentSocialPost | null {
  const networkRaw = String(row[0] ?? "");
  const network = normalizeBrandSummaryNetwork(networkRaw);

  if (!network) {
    return null;
  }

  const publicationDate = parseBrandSummaryDate(row[1]);

  if (!publicationDate) {
    return null;
  }

  const record = {
    publicationDate,
    caption: String(row[2] ?? ""),
    impressions: row[3],
    interactions: row[4],
    postType: String(row[5] ?? ""),
    engagementRate: row[6],
    permalink: row[7],
  };

  const post = mapPostRowToRecentPost(network, {
    publicationDate,
    caption: record.caption,
    postType: record.postType,
    impressions: record.impressions,
    likes: record.interactions,
    engagementRate: record.engagementRate,
    link: record.permalink,
  }, "brand summary");

  return post;
}

export function isFutureScheduledDate(
  publicationDate: { dateTime?: string; timezone?: string } | null | undefined,
  now = new Date(),
): boolean {
  if (!publicationDate?.dateTime) {
    return false;
  }

  const timezone = publicationDate.timezone ?? TRUSTED_BRAND_TIMEZONE;
  const normalized = publicationDate.dateTime.includes("T")
    ? publicationDate.dateTime
    : `${publicationDate.dateTime}T00:00:00`;

  const parsed = new Date(
    normalized.includes("+") || normalized.includes("-", 10)
      ? normalized
      : `${normalized}${CHICAGO_OFFSET}`,
  );

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getTime() > now.getTime();
}

export function isPublishedScheduledStatus(status: unknown): boolean {
  if (typeof status !== "string") {
    return false;
  }

  const normalized = status.trim().toUpperCase();
  return normalized === "PUBLISHED" || normalized.includes("PUBLISH");
}

export function safeProviderNetwork(value: unknown): SocialNetworkKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "twitter" || normalized === "x") {
    return "twitter";
  }

  if (
    normalized === "instagram" ||
    normalized === "facebook" ||
    normalized === "linkedin" ||
    normalized === "tiktok"
  ) {
    return normalized;
  }

  return null;
}

export function isForbiddenBestTimesError(payload: unknown): boolean {
  if (typeof payload === "string") {
    return payload.includes("403") || payload.includes("FORBIDDEN");
  }

  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    record.status === "FORBIDDEN" ||
    record.code === "403" ||
    (typeof record.title === "string" &&
      record.title.includes("Authorization"))
  );
}

export function evolutionAggregationForField(field: string): "last" | "sum" | "avg" {
  if (
    field === "followers" ||
    field === "engagementRate" ||
    field.endsWith("Rate")
  ) {
    return "last";
  }

  if (
    field === "followerGrowth" ||
    field === "followersGained" ||
    field === "followersLost" ||
    field === "follows" ||
    field === "unfollows" ||
    field === "postCount"
  ) {
    return "sum";
  }

  return "sum";
}

export function metricLabelForField(
  network: SocialNetworkKey,
  field: string,
): string {
  const labels: Record<string, string> = {
    followers: "Followers",
    followerGrowth: "Follower growth",
    followersGained: "Followers gained",
    followersLost: "Followers lost",
    follows: "Follows",
    unfollows: "Unfollows",
    reach: "Reach",
    impressions: "Impressions",
    views: "Views",
    postCount: "Posts published",
    engagementRate: "Engagement rate",
    linkClicks: "Link clicks",
    profileClicks: "Profile clicks",
    videoViews: "Video views",
  };

  return labels[field] ?? field;
}

export function metricDefinitionForField(
  network: SocialNetworkKey,
  field: string,
): string | undefined {
  if (field === "engagementRate") {
    switch (network) {
      case "instagram":
      case "facebook":
        return "Interactions per 1,000 people reached.";
      case "linkedin":
        return "Interactions per impressions (not reach).";
      case "tiktok":
        return "Interactions per people reached.";
      case "twitter":
        return "Interactions per impressions. X does not expose reach.";
      default:
        return undefined;
    }
  }

  if (field === "reach" && network === "linkedin") {
    return "LinkedIn exposes impressions, not reach.";
  }

  if (field === "impressions" && network === "tiktok") {
    return "TikTok exposes views and reach, not impressions.";
  }

  return undefined;
}
