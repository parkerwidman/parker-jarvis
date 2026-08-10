import { describe, expect, it } from "vitest";
import {
  buildBriefTranscriptSegments,
  transcriptSegmentsContainHtml,
} from "@/lib/jarvis/briefings/format-brief-transcript";
import {
  buildMorningBriefPlanningContext,
  type MorningBriefGoalRecord,
} from "@/lib/jarvis/briefings/morning-brief-goal-planning";
import {
  BRIEFING_TRANSCRIPT_DEFAULT_OPEN,
  MORNING_BRIEF_BUSY_WORD_MAX,
  MORNING_BRIEF_NORMAL_WORD_MAX,
  MORNING_BRIEF_NORMAL_WORD_MIN,
  buildMorningBriefInstructions,
  buildMorningBriefPlan,
  buildMorningBriefUserPrompt,
  buildProfileFocusPermittedFirstAction,
  buildProfileFocusPriorityReason,
  countMorningBriefWords,
  detectBusyMorning,
  finalizeMorningBriefSpokenText,
  containsMorningBriefForbiddenLabels,
  normalizeMorningBriefGreeting,
  normalizeMorningBriefSpokenText,
  removeMorningBriefReportLabels,
  selectMorningBriefSupportingItems,
  selectMorningBriefTopPriority,
  type MorningBriefEvent,
  type MorningBriefTask,
} from "@/lib/jarvis/briefings/morning-brief-structure";

const TODAY = "2026-08-06";
const PLANNING_END = "2026-08-07";

function buildPlanningContext(
  tasks: MorningBriefTask[],
  options?: {
    todayPriorityGoalId?: string | null;
    goals?: MorningBriefGoalRecord[];
  },
) {
  return buildMorningBriefPlanningContext({
    planningTasks: tasks,
    goals: options?.goals ?? [],
    todayPriorityGoalId: options?.todayPriorityGoalId ?? null,
  });
}

function buildPlanInput(
  overrides: {
    tasks?: MorningBriefTask[];
    events?: MorningBriefEvent[];
    currentFocus?: string | null;
    todayPriorityGoalId?: string | null;
    goals?: MorningBriefGoalRecord[];
  } = {},
) {
  const tasks = overrides.tasks ?? [];
  const planningContext = buildPlanningContext(tasks, {
    todayPriorityGoalId: overrides.todayPriorityGoalId ?? null,
    goals: overrides.goals,
  });

  return {
    planningContext,
    planningTasks: planningContext.planningTasks,
    todayPriorityGoal: planningContext.todayPriorityGoal,
    events: overrides.events ?? [],
    currentFocus: overrides.currentFocus ?? null,
    todayLocal: TODAY,
    planningEndLocal: PLANNING_END,
  };
}

function buildTask(
  overrides: Partial<MorningBriefTask> = {},
): MorningBriefTask {
  return {
    id: "task-1",
    title: "Finish proposal",
    priority: "high",
    due_at: `${TODAY}T15:00:00.000Z`,
    overdue: false,
    dueToday: true,
    dueSoon: true,
    ...overrides,
  };
}

function buildEvent(
  overrides: Partial<MorningBriefEvent> = {},
): MorningBriefEvent {
  const localDate = overrides.localDate ?? TODAY;
  const startIso = overrides.startIso ?? `${localDate}T19:00:00.000Z`;
  const endIso = overrides.endIso ?? `${localDate}T20:00:00.000Z`;

  return {
    subject: "Investor sync",
    startIso,
    endIso,
    localDate,
    localStart: overrides.localStart ?? "Thu, Aug 6, 2026, 2:00 PM CDT",
    localEnd: overrides.localEnd ?? "Thu, Aug 6, 2026, 3:00 PM CDT",
    locationName: null,
    isAllDay: false,
    isCancelled: false,
    showAs: "busy",
    importance: "normal",
    ...overrides,
  };
}

describe("morning brief structure", () => {
  it("prefers explicit current focus over overdue internal chores", () => {
    const topPriority = selectMorningBriefTopPriority(
      buildPlanInput({
        tasks: [
          buildTask({
            id: "focus",
            title: "Write blog post",
            priority: "medium",
            overdue: false,
            dueToday: false,
            dueSoon: false,
            due_at: null,
          }),
          buildTask({
            id: "overdue",
            title: "Renew domain",
            priority: "high",
            overdue: true,
            dueToday: false,
            dueSoon: false,
            due_at: "2026-08-01T15:00:00.000Z",
          }),
        ],
        currentFocus: "Write blog post",
      }),
    );

    expect(topPriority?.phrase).toBe("Write blog post");
    expect(topPriority?.source).toBe("profile_focus_task");
  });

  it("excludes internal setup chores and random due-date tasks from automatic priority", () => {
    const topPriority = selectMorningBriefTopPriority(
      buildPlanInput({
        tasks: [
          buildTask({
            title: "Reconnect Microsoft to Jarvis",
            priority: "high",
            dueToday: true,
          }),
          buildTask({
            id: "task-2",
            title: "Test approval workflow",
            priority: "medium",
            dueToday: true,
          }),
        ],
      }),
    );

    expect(topPriority).toBeNull();
  });

  it("does not let emails become priorities or schedule items in the prompt", () => {
    const planInput = buildPlanInput();
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan: buildMorningBriefPlan(planInput),
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(prompt).not.toContain("Recent inbox previews");
    expect(prompt).not.toContain("Inbox note");
    expect(prompt).not.toContain("unread");
    expect(prompt).toContain("Do not mention inbox email");
  });

  it("includes real calendar events and excludes tentative and reminder events", () => {
    const supporting = selectMorningBriefSupportingItems({
      ...buildPlanInput({
        tasks: [],
        events: [
          buildEvent({ subject: "Class", localDate: TODAY }),
          buildEvent({
            subject: "Maybe coffee",
            localStart: "Thu, Aug 6, 2026, 3:00 PM CDT",
            showAs: "tentative",
          }),
          buildEvent({
            subject: "Reminder",
            startIso: `${TODAY}T08:00:00.000Z`,
            endIso: `${TODAY}T08:15:00.000Z`,
          }),
        ],
      }),
      topPriorityPhrase: null,
      currentFocus: null,
    });

    expect(supporting.some((item) => item.phrase.includes("Class"))).toBe(true);
    expect(supporting.some((item) => item.phrase.includes("Maybe coffee"))).toBe(
      false,
    );
    expect(supporting.some((item) => item.phrase.includes("Reminder"))).toBe(false);
  });

  it("allows an explicitly selected internal task to become the top priority", () => {
    const topPriority = selectMorningBriefTopPriority(
      buildPlanInput({
        tasks: [
          buildTask({
            title: "Reconnect Microsoft to Jarvis",
            priority: "high",
            dueToday: true,
          }),
        ],
        currentFocus: "Reconnect Microsoft to Jarvis",
      }),
    );

    expect(topPriority?.phrase).toBe("Reconnect Microsoft to Jarvis");
    expect(topPriority?.source).toBe("profile_focus_task");
  });

  it("uses free-text current focus when there is no exact task match", () => {
    const topPriority = selectMorningBriefTopPriority(
      buildPlanInput({
        tasks: [],
        currentFocus: "Reconnect Microsoft to Jarvis",
      }),
    );

    expect(topPriority?.phrase).toBe("Reconnect Microsoft to Jarvis");
    expect(topPriority?.source).toBe("profile_focus");
  });

  it("builds an honest no-priority plan when nothing meaningful is selected", () => {
    const plan = buildMorningBriefPlan(
      buildPlanInput({
        tasks: [
          buildTask({
            title: "Reconnect Microsoft to Jarvis",
            priority: "high",
            dueToday: true,
          }),
        ],
        events: [buildEvent({ subject: "Class", localDate: TODAY })],
      }),
    );

    expect(plan.noMeaningfulPriority).toBe(true);
    expect(plan.topPriority).toBeNull();
    expect(plan.scheduleTodayClear).toBe(false);
    expect(plan.firstAction).toContain("Class");
    expect(plan.supportingItems.some((item) => item.phrase.includes("Class"))).toBe(
      true,
    );
  });

  it("detects busy mornings from meaningful tasks and calendar events only", () => {
    const topPriority = selectMorningBriefTopPriority(
      buildPlanInput({
        tasks: [
          buildTask({ title: "Finish proposal", priority: "high", dueToday: true }),
          buildTask({
            id: "task-2",
            title: "Submit taxes",
            priority: "high",
            overdue: true,
          }),
        ],
        events: [
          buildEvent({ subject: "Investor sync" }),
          buildEvent({
            subject: "Team standup",
            localDate: TODAY,
          }),
        ],
      }),
    );

    const isBusy = detectBusyMorning({
      ...buildPlanInput({
        tasks: [
          buildTask({ title: "Finish proposal", priority: "high", dueToday: true }),
          buildTask({
            id: "task-2",
            title: "Submit taxes",
            priority: "high",
            overdue: true,
          }),
        ],
        events: [
          buildEvent({ subject: "Investor sync" }),
          buildEvent({
            subject: "Team standup",
            localDate: TODAY,
          }),
        ],
      }),
      topPriority,
    });

    expect(isBusy).toBe(true);
  });

  it("builds a concise plan with a meaningful top priority and first action", () => {
    const plan = buildMorningBriefPlan(
      buildPlanInput({
        tasks: [buildTask({ title: "Finish proposal", priority: "high", dueToday: true })],
      }),
    );

    expect(plan.topPriority?.phrase).toBe("Finish proposal");
    expect(plan.firstAction).toBe("Work on Finish proposal before the known due date.");
    expect(plan.permittedFirstAction).toBe(
      "Work on Finish proposal before the known due date.",
    );
    expect(plan.supportingItems.length).toBeLessThanOrEqual(2);
    expect(plan.wordTarget.max).toBe(MORNING_BRIEF_NORMAL_WORD_MAX);
  });

  it("extends busy plans toward the busy word cap", () => {
    const planInput = buildPlanInput({
      tasks: [
        buildTask({ title: "Finish proposal", priority: "high", overdue: true }),
        buildTask({
          id: "task-2",
          title: "Submit taxes",
          priority: "high",
          dueToday: true,
        }),
      ],
      events: [
        buildEvent({ subject: "Investor sync" }),
        buildEvent({
          subject: "Team standup",
          localStart: `${TODAY}T09:00:00`,
        }),
      ],
    });
    const plan = buildMorningBriefPlan(planInput);

    expect(plan.isBusyMorning).toBe(true);
    expect(plan.wordTarget.max).toBe(MORNING_BRIEF_BUSY_WORD_MAX);
  });

  it("omits empty categories from the generation prompt", () => {
    const planInput = buildPlanInput();
    const plan = buildMorningBriefPlan(planInput);

    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(prompt).toContain("Verified meaningful schedule or deadline items: none.");
    expect(prompt).toContain("No meaningful task priority was selected");
    expect(prompt).toContain("Do not mention refund dates");
    expect(prompt).not.toContain("Melusi expense signals");
    expect(prompt).not.toContain("Personal finance signals");
  });

  it("builds a clear-schedule plan when only reminder events exist", () => {
    const plan = buildMorningBriefPlan(
      buildPlanInput({
        currentFocus: "Decide whether to drop any of next semester's classes",
        events: [
          buildEvent({
            subject: "Reminder",
            startIso: "2026-08-07T08:00:00.000Z",
            endIso: "2026-08-07T08:15:00.000Z",
            localDate: "2026-08-07",
            localStart: "Thu, Aug 7, 2026, 3:00 AM CDT",
          }),
        ],
      }),
    );

    expect(plan.scheduleTodayClear).toBe(true);
    expect(plan.supportingItems).toHaveLength(0);
    expect(plan.permittedFirstAction).toBe(
      "Review where Decide whether to drop any of next semester's classes stands and decide the next concrete step.",
    );
  });

  it("keeps selected-focus explanations grounded without unsupported consequences", () => {
    const focus = "Decide whether to drop any of next semester's classes";
    const planInput = buildPlanInput({
      currentFocus: focus,
    });
    const plan = buildMorningBriefPlan(planInput);
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });
    const instructions = buildMorningBriefInstructions({
      preferredName: "Parker",
      timeZone: "America/Chicago",
      communicationStyle: null,
    });

    expect(buildProfileFocusPriorityReason()).toBe(
      "Parker selected this as the current focus, so that is the right place to start.",
    );
    expect(plan.topPriority?.reason).toBe(buildProfileFocusPriorityReason());
    expect(prompt).toContain("Selected-focus explanation (strict)");
    expect(prompt).toContain("Do not add downstream impact");
    expect(prompt).not.toContain("shape what else");
    expect(instructions).toContain("Selected-focus rule");
    expect(instructions).toContain("Do not invent downstream impact");
  });

  it("still states verified due dates for deadline priorities", () => {
    const planInput = buildPlanInput({
      tasks: [buildTask({ title: "Finish proposal", priority: "high", dueToday: true })],
    });
    const plan = buildMorningBriefPlan(planInput);
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(plan.topPriority?.source).toBe("meaningful_deadline");
    expect(plan.topPriority?.dueDate).toBe(TODAY);
    expect(prompt).toContain(`verified due date: ${TODAY}`);
    expect(prompt).not.toContain("Selected-focus explanation");
  });

  it("preserves focus wording in conservative first actions", () => {
    const focus = "Decide whether to drop any of next semester's classes";

    expect(buildProfileFocusPermittedFirstAction(focus)).toBe(
      "Review where Decide whether to drop any of next semester's classes stands and decide the next concrete step.",
    );
  });

  it("includes canonical priority text in the generation prompt", () => {
    const planInput = buildPlanInput({
      currentFocus: "figure out retroactive withdrawal for last semester's classes",
    });
    const plan = buildMorningBriefPlan(planInput);
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(plan.canonicalPriorityText).toBe(
      "figure out retroactive withdrawal for last semester's classes",
    );
    expect(prompt).toContain("Canonical priority text");
    expect(prompt).toContain(plan.canonicalPriorityText);
  });

  it("forbids unsupported inference in the generation prompt", () => {
    const planInput = buildPlanInput({
      currentFocus: "Decide whether to drop any of next semester's classes",
    });
    const plan = buildMorningBriefPlan(planInput);
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Thursday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan,
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(prompt).toContain("Permitted first action");
    expect(prompt).toContain("Do not mention refund dates");
    expect(prompt).toContain("financial aid");
    expect(prompt).toContain("Parker selected this as the current focus, so that is the right place to start.");
    expect(prompt).not.toContain("Recent inbox previews");
  });

  it("uses concise conversational spoken-brief instructions instead of markdown sections", () => {
    const instructions = buildMorningBriefInstructions({
      preferredName: "Parker",
      timeZone: "America/Chicago",
      communicationStyle: "Direct",
    });

    expect(instructions).toContain(`Good morning, Parker.`);
    expect(instructions).toContain(`${MORNING_BRIEF_NORMAL_WORD_MIN}-${MORNING_BRIEF_NORMAL_WORD_MAX} words`);
    expect(instructions).toContain("The main thing I'd focus on first is");
    expect(instructions).toContain("Top priority:");
    expect(instructions).toContain("Never use:");
    expect(instructions).not.toContain("## Top 3 Priorities");
  });

  it("asks the model to blend priorities without report-style labels", () => {
    const planInput = buildPlanInput({
      tasks: [buildTask({ title: "Finish proposal", priority: "high", dueToday: true })],
    });
    const prompt = buildMorningBriefUserPrompt({
      localDateLabel: "Wednesday, August 6, 2026",
      dateTimeSection: "UTC: now",
      plan: buildMorningBriefPlan(planInput),
      preferredName: "Parker",
      planningContext: planInput.planningContext,
      events: [],
      calendarNote: null,
    });

    expect(prompt).toContain('Do not use section labels such as "Top priority:"');
    expect(prompt).toContain("natural connected sentences");
  });

  it("normalizes stored brief text for later TTS", () => {
    const normalized = normalizeMorningBriefSpokenText(
      "# Morning Brief\n\n**Good morning, Parker.** Start with the proposal.",
    );

    expect(normalized).toBe(
      "Morning Brief Good morning, Parker. Start with the proposal.",
    );
    expect(normalized).not.toContain("**");
    expect(normalized).not.toContain("#");
    expect(countMorningBriefWords(normalized)).toBe(9);
  });
});

describe("morning brief spoken voice normalization", () => {
  const ROBOTIC_BRIEF =
    "Morning, Parker. Top priority: Reconnect Microsoft to Jarvis. It's due today and is blocking Jarvis features. Time-sensitive: Test approval workflow is due tomorrow, and you have the Plaid intro meeting tomorrow at 5 pm Central. First action: Reconnect Microsoft to Jarvis now.";

  it("begins with Good morning and removes forbidden labels", () => {
    const finalized = finalizeMorningBriefSpokenText(ROBOTIC_BRIEF, "Parker");

    expect(finalized.startsWith("Good morning, Parker.")).toBe(true);
    expect(containsMorningBriefForbiddenLabels(finalized)).toBe(false);
    expect(finalized).not.toMatch(/\bTop priority:/i);
    expect(finalized).not.toMatch(/\bTime-sensitive:/i);
    expect(finalized).not.toMatch(/\bFirst action:/i);
  });

  it("preserves underlying task names, deadlines, and meeting times", () => {
    const finalized = finalizeMorningBriefSpokenText(ROBOTIC_BRIEF, "Parker");

    expect(finalized).toContain("Reconnect Microsoft to Jarvis");
    expect(finalized).toContain("Test approval workflow");
    expect(finalized).toContain("due tomorrow");
    expect(finalized).toContain("Plaid intro meeting");
    expect(finalized).toContain("5 pm Central");
  });

  it("does not prepend a second greeting when one is already correct", () => {
    const alreadyCorrect =
      "Good morning, Parker. The main thing I'd focus on first is reconnecting Microsoft to Jarvis.";

    expect(finalizeMorningBriefSpokenText(alreadyCorrect, "Parker")).toBe(
      alreadyCorrect,
    );
  });

  it("normalizes weak greetings without changing other names or facts", () => {
    expect(normalizeMorningBriefGreeting("Morning, Parker. Start now.", "Parker")).toBe(
      "Good morning, Parker. Start now.",
    );
    expect(
      normalizeMorningBriefGreeting("Today, Parker, reconnect Microsoft.", "Parker"),
    ).toBe("Good morning, Parker. reconnect Microsoft.");
  });

  it("keeps concise plain spoken text without markdown or bullets", () => {
    const finalized = finalizeMorningBriefSpokenText(
      "**Top priority:** Finish proposal\n- inbox review\n# Summary",
      "Parker",
    );

    expect(finalized).not.toContain("**");
    expect(finalized).not.toContain("#");
    expect(finalized).not.toContain("- inbox");
    expect(finalized).not.toMatch(/\bTop priority:/i);
    expect(finalized.startsWith("Good morning, Parker.")).toBe(true);
  });

  it("conservatively strips report labels without rewriting facts", () => {
    const stripped = removeMorningBriefReportLabels(
      "Top priority: Renew domain. Time-sensitive: Investor sync at 2:00 PM.",
    );

    expect(stripped).toBe("Renew domain. Investor sync at 2:00 PM.");
    expect(stripped).toContain("Renew domain");
    expect(stripped).toContain("2:00 PM");
  });

  it("keeps concise length behavior intact after finalization", () => {
    const concise =
      "Good morning, Parker. The main thing I'd focus on first is finishing the proposal before your investor sync at 2 pm. I'd start there, then you'll be clear for the rest of the morning.";

    expect(countMorningBriefWords(finalizeMorningBriefSpokenText(concise, "Parker"))).toBe(
      countMorningBriefWords(concise),
    );
    expect(
      countMorningBriefWords(finalizeMorningBriefSpokenText(ROBOTIC_BRIEF, "Parker")),
    ).toBeLessThanOrEqual(MORNING_BRIEF_BUSY_WORD_MAX);
  });
});

describe("brief transcript formatting", () => {
  it("does not treat HTML-like input as markup when building segments", () => {
    const transcript =
      "Good morning. Top priority: <script>alert(1)</script>. First action: review inbox.";
    const segments = buildBriefTranscriptSegments(transcript, "review inbox");

    expect(transcriptSegmentsContainHtml(segments)).toBe(true);
    expect(segments.some((segment) => segment.text.includes("<script>"))).toBe(
      true,
    );
  });

  it("emphasizes only the exact priority phrase", () => {
    const transcript =
      "Good morning, Parker. Renew domain is overdue and due today. I'd start by renewing the domain before noon.";
    const segments = buildBriefTranscriptSegments(transcript, "Renew domain");
    const emphasized = segments
      .filter((segment) => segment.emphasized)
      .map((segment) => segment.text);

    expect(emphasized).toEqual(["Renew domain"]);
    expect(emphasized.some((text) => text.toLowerCase().includes("overdue"))).toBe(
      false,
    );
  });

  it("defaults the transcript panel to open", () => {
    expect(BRIEFING_TRANSCRIPT_DEFAULT_OPEN).toBe(true);
  });
});
