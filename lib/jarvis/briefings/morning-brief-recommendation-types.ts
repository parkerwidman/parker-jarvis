export type MorningBriefRecommendedMode = "personal" | "melusi";

export const MORNING_BRIEF_RECOMMENDED_MODE_VALUES = [
  "personal",
  "melusi",
] as const satisfies readonly MorningBriefRecommendedMode[];

export type MorningBriefRecommendationMetadata = {
  recommendedMode: MorningBriefRecommendedMode;
  recommendationSentenceIndex: number;
};
