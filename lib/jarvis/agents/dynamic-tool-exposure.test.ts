import { describe, expect, it } from "vitest";

import { resolveMainJarvisToolExposure } from "@/lib/jarvis/agents/dynamic-tool-exposure";
import { getToolsForAgent } from "@/lib/jarvis/agents/tool-definitions";
import {
  buildMainToolDomainInventory,
  estimateToolSchemaTokensByTool,
  getToolsForMainDomains,
  rankToolSchemasBySize,
} from "@/lib/jarvis/agents/tool-domains";
import { estimateToolSchemaTokens } from "@/lib/jarvis/performance/model-usage";
import {
  buildCompactPendingScheduleMarker,
  resolvePendingSchedulePresentation,
} from "@/lib/jarvis/schedule/pending-schedule-presentation";
import type { PendingScheduleActionRecord } from "@/lib/jarvis/schedule/pending-schedule-action-types";

const ALL_MAIN_TOOLS = getToolsForAgent("main");

const pendingAction: PendingScheduleActionRecord = {
  id: "pending-1",
  userId: "user-1",
  agentKey: "main",
  actionType: "move",
  summary: "Move workout to 4 PM",
  payload: {},
  status: "pending",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("dynamic Main Jarvis tool exposure", () => {
  it("A exposes no tools for general knowledge", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "Explain compound interest in three sentences.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.tools).toHaveLength(0);
    expect(exposure.routingReason).toBe("general_knowledge");
  });

  it("B exposes Schedule read tools for schedule day questions", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What does my day tomorrow look like?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["schedule_read"]);
    expect(exposure.tools.map((tool) => tool.type === "function" && tool.name)).toEqual([
      "get_schedule_for_date",
      "get_schedule_for_week",
      "get_schedule_periods",
      "find_schedule_open_windows",
    ]);
    expect(
      exposure.tools.some(
        (tool) => tool.type === "function" && tool.name === "get_personal_finance_summary",
      ),
    ).toBe(false);
  });

  it("C exposes Outlook calendar tools for Outlook calendar questions", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What's on my Outlook calendar tomorrow?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toContain("outlook_calendar");
    expect(
      exposure.tools.some(
        (tool) => tool.type === "function" && tool.name === "list_outlook_calendar",
      ),
    ).toBe(true);
  });

  it("D exposes task tools for task questions", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What tasks do I need to finish?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["tasks"]);
  });

  it("E exposes finance tools for spending questions", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "How much have I spent this month?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["personal_finance"]);
  });

  it("F exposes requested multi-source domains", () => {
    const exposure = resolveMainJarvisToolExposure({
      message:
        "Look at my Schedule, Outlook, tasks, and goals and tell me what I should prioritize tomorrow.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual([
      "tasks",
      "outlook_calendar",
      "schedule_read",
    ]);
    expect(exposure.tools.some((tool) => tool.type === "function" && tool.name === "create_goal")).toBe(
      false,
    );
  });

  it("G exposes Schedule read and write tools for schedule mutations", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "Move tomorrow's workout to 4 PM.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["schedule_read", "schedule_write"]);
    expect(
      exposure.tools.some(
        (tool) => tool.type === "function" && tool.name === "propose_move_schedule_item",
      ),
    ).toBe(true);
  });

  it("H keeps confirmation tools available for contextual yes", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "yes",
      confirmationIntent: "confirm",
      pendingAction,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["schedule_read", "schedule_write"]);
    expect(
      exposure.tools.some(
        (tool) =>
          tool.type === "function" && tool.name === "confirm_pending_schedule_action",
      ),
    ).toBe(true);
  });

  it("I keeps cancel tools available for never mind", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "never mind",
      confirmationIntent: "cancel",
      pendingAction,
      contextTarget: null,
    });

    expect(
      exposure.tools.some(
        (tool) =>
          tool.type === "function" && tool.name === "cancel_pending_schedule_action",
      ),
    ).toBe(true);
  });

  it("J keeps revision capabilities available for pending revisions", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "make it 5 PM instead",
      confirmationIntent: "revise",
      pendingAction,
      contextTarget: null,
    });

    expect(exposure.domains).toEqual(["schedule_read", "schedule_write"]);
  });

  it("K uses a safe planning fallback for ambiguous user-data requests", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What should I focus on tomorrow?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    expect(exposure.routingReason).toBe("planning_fallback");
    expect(exposure.domains).toEqual(["tasks", "outlook_calendar", "schedule_read"]);
    expect(exposure.tools.length).toBeLessThan(ALL_MAIN_TOOLS.length);
  });

  it("preserves stable domain tool ordering for cache friendliness", () => {
    const first = getToolsForMainDomains(["schedule_read", "tasks"]);
    const second = getToolsForMainDomains(["schedule_read", "tasks"]);

    expect(first.map((tool) => tool.type === "function" && tool.name)).toEqual(
      second.map((tool) => tool.type === "function" && tool.name),
    );
  });

  it("reports the full Main inventory count", () => {
    expect(buildMainToolDomainInventory()).toHaveLength(32);
  });
});

describe("pending schedule presentation relevance", () => {
  it("uses compact pending context for unrelated substantive requests", () => {
    const presentation = resolvePendingSchedulePresentation({
      pendingAction,
      confirmationIntent: "unknown",
      currentMessage: "Explain compound interest in three sentences.",
    });

    expect(presentation).toBe("compact");
    expect(buildCompactPendingScheduleMarker(pendingAction)).toContain("pending-1");
  });

  it("uses full pending context for confirmation follow-ups", () => {
    const presentation = resolvePendingSchedulePresentation({
      pendingAction,
      confirmationIntent: "confirm",
      currentMessage: "yes",
    });

    expect(presentation).toBe("full");
  });
});

describe("tool schema sizing", () => {
  it("ranks tool schemas by estimated size", () => {
    const ranked = rankToolSchemasBySize(ALL_MAIN_TOOLS);

    expect(ranked.length).toBe(32);
    expect(ranked[0]?.estimatedTokens).toBeGreaterThanOrEqual(
      ranked[ranked.length - 1]?.estimatedTokens ?? 0,
    );
  });

  it("shows general knowledge exposure is dramatically smaller than all tools", () => {
    const general = resolveMainJarvisToolExposure({
      message: "Explain compound interest in three sentences.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    }).tools;

    expect(estimateToolSchemaTokens(general)).toBe(0);
    expect(estimateToolSchemaTokens(ALL_MAIN_TOOLS)).toBeGreaterThan(8000);
  });

  it("shows schedule and multi-source exposure remain smaller than all tools", () => {
    const schedule = resolveMainJarvisToolExposure({
      message: "What does my day tomorrow look like?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    }).tools;
    const multiSource = resolveMainJarvisToolExposure({
      message:
        "Look at my Schedule, Outlook, tasks, and goals and tell me what I should prioritize tomorrow.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    }).tools;

    const allSchemaTokens = estimateToolSchemaTokens(ALL_MAIN_TOOLS);
    expect(estimateToolSchemaTokens(schedule)).toBeLessThan(allSchemaTokens);
    expect(estimateToolSchemaTokens(multiSource)).toBeLessThan(allSchemaTokens);
    expect(estimateToolSchemaTokensByTool(multiSource).length).toBeGreaterThan(
      estimateToolSchemaTokensByTool(schedule).length,
    );
  });
});
