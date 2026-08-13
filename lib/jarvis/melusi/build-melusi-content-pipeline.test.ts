import { describe, expect, it } from "vitest";
import { buildMelusiContentPipeline } from "@/lib/jarvis/melusi/build-melusi-content-pipeline";

describe("buildMelusiContentPipeline", () => {
  it("shows not connected for social when Metricool is disconnected", () => {
    const result = buildMelusiContentPipeline({
      activeProjectCount: 2,
      openTaskCount: 1,
      socialConnected: false,
      socialSummary: null,
    });

    const social = result.items.find((item) => item.id === "social");

    expect(social?.value).toBe("Not connected");
    expect(social?.tracked).toBe(false);
  });

  it("uses real upcoming scheduled count when social is connected", () => {
    const result = buildMelusiContentPipeline({
      activeProjectCount: 2,
      openTaskCount: 3,
      socialConnected: true,
      socialSummary: {
        connectionStatus: "connected",
        cadenceStaticPace: null,
        cadenceReelPace: null,
        alertCount: 0,
        recentPublicationCount: 1,
        upcomingScheduledCount: 4,
        refreshedAt: null,
      },
    });

    const social = result.items.find((item) => item.id === "social");

    expect(social?.value).toBe("4");
    expect(social?.count).toBe(4);
    expect(social?.tracked).toBe(true);
  });

  it("uses real active project and open task counts", () => {
    const result = buildMelusiContentPipeline({
      activeProjectCount: 3,
      openTaskCount: 5,
      socialConnected: false,
      socialSummary: null,
    });

    expect(result.items[0]).toMatchObject({
      label: "Active projects",
      value: "3",
      count: 3,
    });
    expect(result.items[1]).toMatchObject({
      label: "Open tasks",
      value: "5",
      count: 5,
    });
  });
});
