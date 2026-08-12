import { describe, expect, it } from "vitest";

import {
  buildCommandCenterInsight,
  buildJarvisStatusLabel,
} from "@/lib/jarvis/dashboard/command-center-insight";

describe("buildJarvisStatusLabel", () => {
  it("reports reconnect when Microsoft needs attention", () => {
    expect(
      buildJarvisStatusLabel({
        overdueTasks: 0,
        pendingApprovals: 0,
        needsReconnect: true,
      }).headline,
    ).toBe("Reconnect needed");
  });

  it("reports systems ready when dashboard is clear", () => {
    const status = buildJarvisStatusLabel({
      overdueTasks: 0,
      pendingApprovals: 0,
      needsReconnect: false,
    });

    expect(status.headline).toBe("Systems Ready");
    expect(status.detail).toBe("Jarvis Online");
  });
});

describe("buildCommandCenterInsight", () => {
  it("summarizes real task and calendar counts without inventing metrics", () => {
    const insight = buildCommandCenterInsight({
      completedTodayCount: 2,
      openTaskCount: 3,
      todayEventCount: 1,
      overdueTasks: 0,
      pendingApprovals: 0,
      primaryGoalTitle: "Launch Melusi",
      primaryGoalProgress: 40,
    });

    expect(insight).toContain("completed 2 tasks");
    expect(insight).toContain("3 open tasks");
    expect(insight).toContain("1 event on today's calendar");
  });
});
