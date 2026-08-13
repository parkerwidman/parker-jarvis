import { describe, expect, it } from "vitest";
import { buildMelusiBusinessHealth } from "@/lib/jarvis/melusi/build-melusi-business-health";

describe("buildMelusiBusinessHealth", () => {
  it("returns optimal when there are no urgent or warning attention items", () => {
    const result = buildMelusiBusinessHealth({
      attentionItems: [],
      businessPriority: {
        kind: "task",
        id: "task-1",
        title: "Ship launch video",
        priority: "medium",
        dueAt: null,
        overdue: false,
        dueToday: false,
        projectId: null,
        projectName: null,
        selectionReason: "Next open Melusi task",
        nextAction: "Complete this task",
      },
      activeProjectCount: 2,
      openTaskCount: 1,
      socialStatus: "disconnected",
      socialConnected: false,
    });

    expect(result.state).toBe("optimal");
    expect(result.headline).toBe("All Systems Optimal");
  });

  it("returns needs attention when a warning item exists", () => {
    const result = buildMelusiBusinessHealth({
      attentionItems: [
        {
          id: "warning-1",
          severity: "warning",
          message: "Create 1st Video has no next action assigned",
          href: "/melusi/projects/abc",
        },
      ],
      businessPriority: null,
      activeProjectCount: 2,
      openTaskCount: 0,
      socialStatus: "disconnected",
      socialConnected: false,
    });

    expect(result.state).toBe("needs_attention");
    expect(result.headline).toBe("Needs Attention");
  });

  it("returns needs attention when the top priority task is overdue", () => {
    const result = buildMelusiBusinessHealth({
      attentionItems: [],
      businessPriority: {
        kind: "task",
        id: "task-1",
        title: "Overdue task",
        priority: "high",
        dueAt: "2026-01-01T00:00:00.000Z",
        overdue: true,
        dueToday: false,
        projectId: null,
        projectName: null,
        selectionReason: "Overdue high-priority task",
        nextAction: "Complete this task",
      },
      activeProjectCount: 1,
      openTaskCount: 1,
      socialStatus: "connected",
      socialConnected: true,
    });

    expect(result.state).toBe("needs_attention");
    expect(result.summary).toContain("overdue");
  });

  it("returns limited when there is no business activity", () => {
    const result = buildMelusiBusinessHealth({
      attentionItems: [],
      businessPriority: null,
      activeProjectCount: 0,
      openTaskCount: 0,
      socialStatus: "disconnected",
      socialConnected: false,
    });

    expect(result.state).toBe("limited");
    expect(result.headline).toBe("Limited Activity");
  });

  it("returns needs attention when social reconnect is required", () => {
    const result = buildMelusiBusinessHealth({
      attentionItems: [],
      businessPriority: null,
      activeProjectCount: 1,
      openTaskCount: 1,
      socialStatus: "reconnect_required",
      socialConnected: false,
    });

    expect(result.state).toBe("needs_attention");
    expect(result.summary).toContain("renewed");
  });
});
