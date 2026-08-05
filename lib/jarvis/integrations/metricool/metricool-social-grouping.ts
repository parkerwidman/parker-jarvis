import "server-only";

import type {
  ContentGroupingConfidence,
  GroupedCoreContent,
  NetworkPublicationMetrics,
  RecentSocialPost,
  SocialNetworkKey,
} from "./metricool-social-types";

/** Cross-posts on the same core item are usually published within minutes of each other. */
export const INFERRED_PUBLICATION_WINDOW_MS = 15 * 60 * 1000;
const MIN_CAPTION_LENGTH_FOR_GROUPING = 12;

export function normalizeCaptionForGrouping(caption: string): string {
  return caption.replace(/\s+/g, " ").trim().toLowerCase();
}

function isNonEmptyIdentifier(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function publicationTimestamp(isoDate: string): number {
  return new Date(isoDate).getTime();
}

export function postsWithinTrustedWindow(
  left: RecentSocialPost,
  right: RecentSocialPost,
  windowMs = INFERRED_PUBLICATION_WINDOW_MS,
): boolean {
  const leftTime = publicationTimestamp(left.publicationDate);
  const rightTime = publicationTimestamp(right.publicationDate);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return false;
  }

  return Math.abs(leftTime - rightTime) <= windowMs;
}

function structuredGroupingKey(
  post: RecentSocialPost,
): { key: string; confidence: "planner" | "campaign" } | null {
  if (isNonEmptyIdentifier(post.plannerId)) {
    return { key: `planner:${post.plannerId.trim()}`, confidence: "planner" };
  }

  if (isNonEmptyIdentifier(post.campaignId)) {
    return { key: `campaign:${post.campaignId.trim()}`, confidence: "campaign" };
  }

  return null;
}

function pickPreferredPublication(
  left: RecentSocialPost,
  right: RecentSocialPost,
): RecentSocialPost {
  if (left.permalink && !right.permalink) {
    return left;
  }

  if (right.permalink && !left.permalink) {
    return right;
  }

  return publicationTimestamp(left.publicationDate) >=
    publicationTimestamp(right.publicationDate)
    ? left
    : right;
}

export function dedupeOnePublicationPerNetwork(
  posts: RecentSocialPost[],
): RecentSocialPost[] {
  const byNetwork = new Map<SocialNetworkKey, RecentSocialPost>();

  for (const post of posts) {
    const existing = byNetwork.get(post.network);
    if (!existing) {
      byNetwork.set(post.network, post);
      continue;
    }

    byNetwork.set(post.network, pickPreferredPublication(existing, post));
  }

  return [...byNetwork.values()];
}

export function hasAdditionalInferredSignal(
  seed: RecentSocialPost,
  candidate: RecentSocialPost,
): boolean {
  if (seed.postType === candidate.postType) {
    return true;
  }

  if (
    seed.mediaPreviewUrl !== null &&
    candidate.mediaPreviewUrl !== null &&
    seed.mediaPreviewUrl === candidate.mediaPreviewUrl
  ) {
    return true;
  }

  if (
    isNonEmptyIdentifier(seed.campaignId) &&
    isNonEmptyIdentifier(candidate.campaignId) &&
    seed.campaignId.trim() === candidate.campaignId.trim()
  ) {
    return true;
  }

  return false;
}

export function canInferCrossPostGroup(
  seed: RecentSocialPost,
  candidate: RecentSocialPost,
): boolean {
  if (seed.network === candidate.network) {
    return false;
  }

  const seedCaption = normalizeCaptionForGrouping(seed.caption);
  const candidateCaption = normalizeCaptionForGrouping(candidate.caption);

  if (seedCaption.length < MIN_CAPTION_LENGTH_FOR_GROUPING) {
    return false;
  }

  if (seedCaption !== candidateCaption) {
    return false;
  }

  if (!postsWithinTrustedWindow(seed, candidate)) {
    return false;
  }

  return hasAdditionalInferredSignal(seed, candidate);
}

function toPublicationMetrics(post: RecentSocialPost): NetworkPublicationMetrics {
  return {
    network: post.network,
    publicationDate: post.publicationDate,
    postType: post.postType,
    permalink: post.permalink,
    reach: post.reach,
    impressions: post.impressions,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    clicks: post.clicks,
    engagementRate: post.engagementRate,
    engagementContext: post.engagementContext,
  };
}

function buildGroupedContent(
  posts: RecentSocialPost[],
  confidence: ContentGroupingConfidence,
  index: number,
): GroupedCoreContent {
  const deduped = dedupeOnePublicationPerNetwork(posts);
  const sorted = [...deduped].sort(
    (left, right) =>
      publicationTimestamp(left.publicationDate) -
      publicationTimestamp(right.publicationDate),
  );
  const primary = sorted[0]!;
  const networks = [...new Set(sorted.map((post) => post.network))];

  return {
    id: `group-${index}-${primary.publicationDate}`,
    caption: primary.caption,
    publicationDate: primary.publicationDate,
    postType: primary.postType,
    mediaPreviewUrl:
      sorted.find((post) => post.mediaPreviewUrl)?.mediaPreviewUrl ?? null,
    networks,
    publications: sorted.map(toPublicationMetrics),
    groupingConfidence: confidence,
  };
}

export function groupRecentPostsIntoCoreContent(
  posts: RecentSocialPost[],
): GroupedCoreContent[] {
  const assigned = new Set<RecentSocialPost>();
  const groups: GroupedCoreContent[] = [];
  let groupIndex = 0;

  const byStructuredKey = new Map<
    string,
    { confidence: "planner" | "campaign"; posts: RecentSocialPost[] }
  >();

  for (const post of posts) {
    const grouping = structuredGroupingKey(post);
    if (!grouping) {
      continue;
    }

    const bucket = byStructuredKey.get(grouping.key) ?? {
      confidence: grouping.confidence,
      posts: [],
    };
    bucket.posts.push(post);
    byStructuredKey.set(grouping.key, bucket);
  }

  for (const bucket of byStructuredKey.values()) {
    const deduped = dedupeOnePublicationPerNetwork(bucket.posts);
    const uniqueNetworks = new Set(deduped.map((post) => post.network));

    if (deduped.length < 2 || uniqueNetworks.size < 2) {
      continue;
    }

    for (const post of bucket.posts) {
      assigned.add(post);
    }

    groups.push(buildGroupedContent(deduped, bucket.confidence, groupIndex));
    groupIndex += 1;
  }

  const remaining = posts.filter((post) => !assigned.has(post));

  for (let index = 0; index < remaining.length; index += 1) {
    const seed = remaining[index]!;
    if (assigned.has(seed)) {
      continue;
    }

    const inferredGroup = [seed];

    for (let inner = index + 1; inner < remaining.length; inner += 1) {
      const candidate = remaining[inner]!;
      if (assigned.has(candidate)) {
        continue;
      }

      if (canInferCrossPostGroup(seed, candidate)) {
        inferredGroup.push(candidate);
      }
    }

    if (inferredGroup.length < 2) {
      continue;
    }

    for (const post of inferredGroup) {
      assigned.add(post);
    }

    groups.push(buildGroupedContent(inferredGroup, "inferred", groupIndex));
    groupIndex += 1;
  }

  for (const post of posts) {
    if (assigned.has(post)) {
      continue;
    }

    groups.push(buildGroupedContent([post], "single", groupIndex));
    groupIndex += 1;
  }

  return groups.sort(
    (left, right) =>
      publicationTimestamp(right.publicationDate) -
      publicationTimestamp(left.publicationDate),
  );
}

export function countGroupedCoreContent(groups: GroupedCoreContent[]): number {
  return groups.filter((group) => group.publications.length > 0).length;
}

export function networksInGroups(groups: GroupedCoreContent[]): SocialNetworkKey[] {
  const networks = new Set<SocialNetworkKey>();
  for (const group of groups) {
    for (const network of group.networks) {
      networks.add(network);
    }
  }
  return [...networks];
}
