import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMorningBriefGoalPlanningPromptSections,
  buildMorningBriefPlanningContext,
  filterMorningBriefPlanningTasks,
  buildMorningBriefActionableIndex,
  type MorningBriefGoalRecord,
} from "@/lib/jarvis/briefings/morning-brief-goal-planning";
import {
  buildMorningBriefPlan,
  buildMorningBriefUserPrompt,
  selectMorningBriefTopPriority,
  type MorningBriefTask,
} from "@/lib/jarvis/briefings/morning-brief-structure";
import {
  finalizeMorningBriefRecommendation,
  resolveMorningBriefRecommendationContextFromPriority,
} from "@/lib/jarvis/briefings/morning-brief-recommendation";
import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import { resolveMorningBriefTtsConfig } from "@/lib/jarvis/audio/tts-config";

const ROOT = resolve(import.meta.dirname, "../../..");
const GOAL_ID = "goal-short";
const LEVEL_ONE = "level-1";
const LEVEL_TWO = "level-2";
const TODAY = "2026-08-09";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function goal(overrides?: Partial<MorningBriefGoalRecord>): MorningBriefGoalRecord {
  return {
    id: GOAL_ID,
    title: "Get off academic probation",
    goal_type: "short_term",
    status: "active",
    domain: "personal",
    ...overrides,
  };
}

function rawTask(
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    goal_id: string | null;
    goal_level_id: string | null;
    blocked_at: string | null;
    priority: string;
    due_at: string | null;
    overdue: boolean;
    dueToday: boolean;
  }>,
) {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Task",
    status: overrides.status ?? "todo",
    goal_id: "goal_id" in overrides ? overrides.goal_id! : GOAL_ID,
    goal_level_id: "goal_level_id" in overrides ? overrides.goal_level_id! : LEVEL_ONE,
    blocked_at: overrides.blocked_at ?? null,
    position: 0,
    priority: overrides.priority ?? "medium",
    due_at: overrides.due_at ?? null,
    completed_at: null,
    created_at: "2026-08-09T12:00:00.000Z",
    life_area_id: null,
    notes: null,
    project_id: null,
  };
}

function briefingTask(
  overrides: Partial<MorningBriefTask> & Pick<MorningBriefTask, "id" | "title">,
): MorningBriefTask {
  return {
    priority: "medium",
    due_at: null,
    overdue: false,
    dueToday: false,
    dueSoon: false,
    goalContext: null,
    ...overrides,
  };
}

function buildIndex(
  goalTasks: ReturnType<typeof rawTask>[],
  todayPriorityGoalId: string | null = GOAL_ID,
) {
  return buildMorningBriefActionableIndex({
    goals: [goal()],
    levels: [
      { id: LEVEL_ONE, name: "Advisor process", position: 1, goal_id: GOAL_ID },
      { id: LEVEL_TWO, name: "Future level", position: 2, goal_id: GOAL_ID },
    ],
    goalTasks,
    todayPriorityGoalId,
  });
}

function planningContextFromTasks(
  tasks: MorningBriefTask[],
  options?: {
    todayPriorityGoalId?: string | null;
    goals?: MorningBriefGoalRecord[];
  },
) {
  return buildMorningBriefPlanningContext({
    planningTasks: tasks,
    goals: options?.goals ?? [goal()],
    todayPriorityGoalId: options?.todayPriorityGoalId ?? GOAL_ID,
  });
}

describe("Phase 1B2-H1C Morning Brief goal planning", () => {
  it("1-3. Today's Priority goal, level, and actionable tasks enter Brief context", () => {
    const index = buildIndex([
      rawTask({ id: "actionable", title: "Email advisor" }),
    ]);
    const filtered = filterMorningBriefPlanningTasks(
      [
        rawTask({ id: "actionable", title: "Email advisor" }),
        rawTask({ id: "locked", title: "Locked task", goal_level_id: LEVEL_TWO }),
      ],
      index,
    );

    expect(filtered.map((task) => task.id)).toEqual(["actionable"]);

    const tasks = [
      briefingTask({
        id: "actionable",
        title: "Email advisor",
        goalContext: {
          goalId: GOAL_ID,
          goalTitle: "Get off academic probation",
          levelId: LEVEL_ONE,
          levelTitle: "Advisor process",
          isTodayPriority: true,
        },
      }),
    ];
    const context = planningContextFromTasks(tasks);
    const prompt = buildMorningBriefGoalPlanningPromptSections(context).join("\n");

    expect(prompt).toContain("TODAY'S PRIORITY GOAL");
    expect(prompt).toContain("Get off academic probation");
    expect(prompt).toContain("Advisor process");
    expect(prompt).toContain("Email advisor");
  });

  it("4-8. ineligible goal tasks are excluded from planning", () => {
    const index = buildIndex([
      rawTask({ id: "open", title: "Open task" }),
      rawTask({ id: "locked", title: "Locked", goal_level_id: LEVEL_TWO }),
      rawTask({
        id: "blocked",
        title: "Blocked",
        blocked_at: "2026-08-09T00:00:00.000Z",
      }),
    ]);

    expect(index.has("open")).toBe(true);
    expect(index.has("locked")).toBe(false);
    expect(index.has("blocked")).toBe(false);

    const threeMonthIndex = buildMorningBriefActionableIndex({
      goals: [goal({ goal_type: "three_month" })],
      levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
      goalTasks: [rawTask({ id: "three-month" })],
      todayPriorityGoalId: GOAL_ID,
    });
    expect(threeMonthIndex.size).toBe(0);

    const completedGoalIndex = buildMorningBriefActionableIndex({
      goals: [goal({ status: "completed" })],
      levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
      goalTasks: [rawTask({ id: "orphan" })],
      todayPriorityGoalId: GOAL_ID,
    });
    expect(completedGoalIndex.size).toBe(0);
  });

  it("9-10. malformed roadmap fails closed and standalone tasks remain", () => {
    const malformedIndex = buildMorningBriefActionableIndex({
      goals: [goal()],
      levels: [],
      goalTasks: [rawTask({ id: "orphan" })],
      todayPriorityGoalId: GOAL_ID,
    });
    expect(malformedIndex.size).toBe(0);

    const standalone = rawTask({
      id: "solo",
      title: "Buy groceries",
      goal_id: null,
      goal_level_id: null,
    });
    const filtered = filterMorningBriefPlanningTasks([standalone], malformedIndex);
    expect(filtered).toHaveLength(1);
  });

  it("11-16. locked priority hierarchy for current_focus and Today's Priority", () => {
    const priorityGoalTasks = [
      briefingTask({
        id: "goal-task",
        title: "Email advisor",
        goalContext: {
          goalId: GOAL_ID,
          goalTitle: "Get off academic probation",
          levelId: LEVEL_ONE,
          levelTitle: "Advisor process",
          isTodayPriority: true,
        },
      }),
    ];
    const context = planningContextFromTasks(priorityGoalTasks);

    const focusWins = selectMorningBriefTopPriority({
      planningTasks: [
        ...priorityGoalTasks,
        briefingTask({ id: "focus-task", title: "Exact focus task" }),
      ],
      todayPriorityGoal: context.todayPriorityGoal,
      events: [],
      currentFocus: "Exact focus task",
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });
    expect(focusWins?.source).toBe("profile_focus_task");
    expect(focusWins?.phrase).toBe("Exact focus task");

    const priorityWins = selectMorningBriefTopPriority({
      planningTasks: priorityGoalTasks,
      todayPriorityGoal: context.todayPriorityGoal,
      events: [],
      currentFocus: "Stale free-text focus",
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });
    expect(priorityWins?.source).toBe("today_priority_goal");
    expect(priorityWins?.phrase).toBe("Get off academic probation");

    const freeTextFallback = selectMorningBriefTopPriority({
      planningTasks: [],
      todayPriorityGoal: null,
      events: [],
      currentFocus: "Legacy focus text",
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });
    expect(freeTextFallback?.source).toBe("profile_focus");

    const lockedResurrection = selectMorningBriefTopPriority({
      planningTasks: [],
      todayPriorityGoal: null,
      events: [],
      currentFocus: "Locked task title",
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });
    expect(lockedResurrection?.source).toBe("profile_focus");
    expect(lockedResurrection?.phrase).toBe("Locked task title");
  });

  it("17-22. Today Priority recommendation eligibility", () => {
    const actionableContext = planningContextFromTasks([
      briefingTask({
        id: "goal-task",
        title: "Email advisor",
        goalContext: {
          goalId: GOAL_ID,
          goalTitle: "Get off academic probation",
          levelId: LEVEL_ONE,
          levelTitle: "Advisor process",
          isTodayPriority: true,
        },
      }),
    ]);

    const topPriority = selectMorningBriefTopPriority({
      planningTasks: actionableContext.planningTasks,
      todayPriorityGoal: actionableContext.todayPriorityGoal,
      events: [],
      currentFocus: null,
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });

    expect(topPriority?.source).toBe("today_priority_goal");
    expect(topPriority?.phrase).toBe("Get off academic probation");

    const recommendation = resolveMorningBriefRecommendationContextFromPriority({
      topPriority,
      tasks: actionableContext.planningTasks,
      currentFocus: null,
      melusiProjectTaskIds: new Set(),
    });
    expect(recommendation?.recommendedMode).toBe("personal");
    expect(recommendation?.reason).toBe(
      "your top priority is Get off academic probation",
    );

    const blockedOnlyContext = buildMorningBriefPlanningContext({
      planningTasks: [],
      goals: [goal()],
      todayPriorityGoalId: GOAL_ID,
    });
    expect(blockedOnlyContext.todayPriorityGoal).toBeNull();

    const staleContext = buildMorningBriefPlanningContext({
      planningTasks: [],
      goals: [goal()],
      todayPriorityGoalId: "missing-goal",
    });
    expect(staleContext.todayPriorityGoal).toBeNull();
  });

  it("23-29. recommendation metadata for goal and task sources", () => {
    const goalPriority = selectMorningBriefTopPriority({
      planningTasks: planningContextFromTasks([
        briefingTask({
          id: "goal-task",
          title: "Email advisor",
          goalContext: {
            goalId: GOAL_ID,
            goalTitle: "Melusi launch",
            levelId: LEVEL_ONE,
            levelTitle: "Launch prep",
            isTodayPriority: true,
          },
        }),
      ]).planningTasks,
      todayPriorityGoal: {
        goalId: GOAL_ID,
        goalTitle: "Melusi launch",
        levelTitle: "Launch prep",
        domain: "melusi",
        isTodayPriority: true,
        tasks: [],
      },
      events: [],
      currentFocus: null,
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });

    const goalRecommendation = resolveMorningBriefRecommendationContextFromPriority({
      topPriority: goalPriority,
      tasks: [],
      currentFocus: null,
      melusiProjectTaskIds: new Set(),
    });

    expect(goalRecommendation?.recommendedMode).toBe("melusi");

    const { content, metadata } = finalizeMorningBriefRecommendation({
      content: "Good morning, Parker.",
      recommendationContext: goalRecommendation,
    });

    expect(content).toContain(
      "I suggest Melusi mode today because your top priority is Melusi launch.",
    );
    expect(metadata?.recommendedMode).toBe("melusi");
    expect(metadata?.recommendationSentenceIndex).not.toBeNull();

    const taskPriority = selectMorningBriefTopPriority({
      planningTasks: [
        briefingTask({
          id: "task-1",
          title: "Finish proposal",
          priority: "high",
          dueToday: true,
          due_at: `${TODAY}T12:00:00.000Z`,
        }),
      ],
      todayPriorityGoal: null,
      events: [],
      currentFocus: null,
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });

    const taskRecommendation = resolveMorningBriefRecommendationContextFromPriority({
      topPriority: taskPriority,
      tasks: [
        briefingTask({
          id: "task-1",
          title: "Finish proposal",
          priority: "high",
          dueToday: true,
          due_at: `${TODAY}T12:00:00.000Z`,
          lifeAreaName: "Personal",
        }),
      ],
      currentFocus: null,
      melusiProjectTaskIds: new Set(),
    });

    expect(taskRecommendation?.reason).toBe("your top priority is Finish proposal");

    const freeTextRecommendation = resolveMorningBriefRecommendationContextFromPriority({
      topPriority: {
        phrase: "Legacy focus",
        recommendationTitle: "Legacy focus",
        reason: "Parker selected this as the current focus, so that is the right place to start.",
        source: "profile_focus",
        dueDate: null,
      },
      tasks: [],
      currentFocus: "Legacy focus",
      melusiProjectTaskIds: new Set(),
    });
    expect(freeTextRecommendation).toBeNull();
  });

  it("30-35. urgent standalone and structured prompt sections", () => {
    const context = planningContextFromTasks([
      briefingTask({
        id: "goal-task",
        title: "Email advisor",
        goalContext: {
          goalId: GOAL_ID,
          goalTitle: "Get off academic probation",
          levelId: LEVEL_ONE,
          levelTitle: "Advisor process",
          isTodayPriority: true,
        },
      }),
      briefingTask({
        id: "urgent",
        title: "Pay tuition",
        priority: "high",
        overdue: true,
        due_at: "2026-08-08T12:00:00.000Z",
      }),
    ]);

    const plan = buildMorningBriefPlan({
      planningContext: context,
      events: [],
      currentFocus: null,
      todayLocal: TODAY,
      planningEndLocal: TODAY,
    });

    expect(plan.topPriority?.source).toBe("today_priority_goal");
    expect(
      plan.supportingItems.some((item) => item.phrase === "Pay tuition"),
    ).toBe(true);

    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Saturday, August 9, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: context,
      events: [],
      calendarNote: null,
    });

    expect(prompt).toContain("TODAY'S PRIORITY GOAL");
    expect(prompt).toContain("STANDALONE TASKS");
    expect(prompt).toContain("Pay tuition");
    expect(prompt).not.toContain("Eligible non-internal tasks");
    expect(prompt).not.toContain("Locked task");
  });

  it("36-40. integration and regression guards", () => {
    const generator = readSource("lib/jarvis/briefings/generate-morning-brief.ts");
    const helper = readSource("lib/jarvis/goals/actionable-goal-tasks.ts");

    expect(generator).toContain("generateMorningBrief");
    expect(generator).toContain("buildMorningBriefActionableIndex");
    expect(generator).toContain("today_priority_goal_id");
    expect(generator).not.toContain("deriveLevelStates");
    expect(helper).toContain("deriveLevelStates");

    const ttsConfig = resolveMorningBriefTtsConfig();
    const before = computeTtsContentHash({
      text: "Good morning, Parker.",
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      format: "mp3",
      instructionVersion: "morning-brief-v1",
    });
    const after = computeTtsContentHash({
      text: "Good morning, Parker. I suggest Personal mode today because your top priority is Get off academic probation.",
      model: ttsConfig.model,
      voice: ttsConfig.voice,
      format: "mp3",
      instructionVersion: "morning-brief-v1",
    });
    expect(before).not.toBe(after);
  });
});
