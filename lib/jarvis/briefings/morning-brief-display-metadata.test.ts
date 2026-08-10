import { describe, expect, it } from "vitest";
import {
  extractBriefDisplayMetadata,
  getCanonicalPriorityTextFromPlan,
  mergeBriefDisplayIntoSourceCounts,
  resolveBriefPriorityText,
  validateBriefPriorityTextPresence,
} from "@/lib/jarvis/briefings/morning-brief-display-metadata";
import { buildMorningBriefPlanningContext } from "@/lib/jarvis/briefings/morning-brief-goal-planning";
import { buildMorningBriefPlan } from "@/lib/jarvis/briefings/morning-brief-structure";

function buildEmptyPlanningContext(
  tasks: Parameters<typeof buildMorningBriefPlanningContext>[0]["planningTasks"] = [],
  currentFocus: string | null = null,
) {
  return buildMorningBriefPlanningContext({
    planningTasks: tasks,
    goals: [],
    todayPriorityGoalId: null,
  });
}

describe("morning brief display metadata", () => {
  it("carries canonical priorityText from the plan", () => {
    const plan = buildMorningBriefPlan({
      planningContext: buildEmptyPlanningContext([], "figure out retroactive withdrawal for last semester's classes"),
      events: [],
      currentFocus: "figure out retroactive withdrawal for last semester's classes",
      todayLocal: "2026-08-06",
      planningEndLocal: "2026-08-07",
    });

    expect(plan.canonicalPriorityText).toBe(
      "figure out retroactive withdrawal for last semester's classes",
    );
    expect(getCanonicalPriorityTextFromPlan(plan)).toBe(plan.canonicalPriorityText);
  });

  it("merges briefDisplay metadata without overwriting finance or Melusi counts", () => {
    const merged = mergeBriefDisplayIntoSourceCounts(
      {
        tasks: 3,
        finance: { snapshotSuccess: true, signalsGenerated: 1 },
        melusiExpenses: { recurringOverheadStateKey: "key", surfacedSignalKeys: [] },
      },
      {
        priorityText: "Finish proposal",
      },
    );

    expect(merged).toMatchObject({
      tasks: 3,
      finance: { snapshotSuccess: true, signalsGenerated: 1 },
      melusiExpenses: { recurringOverheadStateKey: "key", surfacedSignalKeys: [] },
      briefDisplay: { priorityText: "Finish proposal" },
    });
  });

  it("extracts stored priorityText for dashboard loading", () => {
    expect(
      extractBriefDisplayMetadata({
        briefDisplay: { priorityText: "Finish proposal" },
      }).priorityText,
    ).toBe("Finish proposal");
  });

  it("validates verbatim priority text before completion", () => {
    const priority = "figure out retroactive withdrawal for last semester's classes";
    const transcript =
      "Good morning, Parker. The main thing I'd focus on first is figure out retroactive withdrawal for last semester's classes.";

    expect(validateBriefPriorityTextPresence(transcript, priority)).toBe(true);
    expect(
      validateBriefPriorityTextPresence(
        "Good morning, Parker. Nothing urgent needs attention.",
        priority,
      ),
    ).toBe(false);
  });

  it("falls back to current focus for older brief rows without metadata", () => {
    const transcript =
      "Good morning, Parker. Your current priority is Finish proposal today.";
    const resolved = resolveBriefPriorityText({
      sourceCounts: { tasks: 2 },
      transcript,
      currentFocus: "Finish proposal",
      focusTaskTitle: null,
    });

    expect(resolved).toBe("Finish proposal");
  });

  it("stores null priorityText when the plan has no meaningful priority", () => {
    const plan = buildMorningBriefPlan({
      planningContext: buildEmptyPlanningContext(),
      events: [],
      currentFocus: null,
      todayLocal: "2026-08-06",
      planningEndLocal: "2026-08-07",
    });

    expect(getCanonicalPriorityTextFromPlan(plan)).toBeNull();
    expect(
      mergeBriefDisplayIntoSourceCounts({}, { priorityText: null }).briefDisplay,
    ).toEqual({ priorityText: null });
  });
});
