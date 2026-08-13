import type { SocialCommandCenterSummary } from "@/lib/jarvis/integrations/metricool/metricool-social-types";

export type MelusiContentPipelineItem = {
  id: string;
  label: string;
  value: string;
  count: number | null;
  tracked: boolean;
};

export type MelusiContentPipeline = {
  items: MelusiContentPipelineItem[];
  maxCount: number;
};

export function buildMelusiContentPipeline(input: {
  activeProjectCount: number;
  openTaskCount: number;
  socialConnected: boolean;
  socialSummary: SocialCommandCenterSummary | null;
}): MelusiContentPipeline {
  const socialCount = input.socialConnected
    ? (input.socialSummary?.upcomingScheduledCount ?? 0)
    : null;

  const socialValue = input.socialConnected
    ? String(socialCount ?? 0)
    : "Not connected";

  const items: MelusiContentPipelineItem[] = [
    {
      id: "active-projects",
      label: "Active projects",
      value: String(input.activeProjectCount),
      count: input.activeProjectCount,
      tracked: true,
    },
    {
      id: "open-tasks",
      label: "Open tasks",
      value: String(input.openTaskCount),
      count: input.openTaskCount,
      tracked: true,
    },
    {
      id: "social",
      label: "Social",
      value: socialValue,
      count: socialCount,
      tracked: input.socialConnected,
    },
  ];

  const numericCounts = items
    .map((item) => item.count)
    .filter((count): count is number => count !== null);

  const maxCount = Math.max(1, ...numericCounts);

  return { items, maxCount };
}
