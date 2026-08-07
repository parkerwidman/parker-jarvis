import { describe, expect, it } from "vitest";

import {
  isInternalMorningBriefTask,
  isMeaningfulMorningBriefDeadlineTask,
  shouldIncludeTaskInMorningBriefSelection,
  taskMatchesCurrentFocus,
} from "@/lib/jarvis/briefings/morning-brief-task-policy";

describe("morning brief task policy", () => {
  it("excludes internal Jarvis, Microsoft, Plaid, and test chores by default", () => {
    expect(
      isInternalMorningBriefTask({ title: "Reconnect Microsoft to Jarvis" }),
    ).toBe(true);
    expect(
      isInternalMorningBriefTask({ title: "Test approval workflow" }),
    ).toBe(true);
    expect(
      isInternalMorningBriefTask({ title: "Plaid intro setup" }),
    ).toBe(true);
    expect(
      isInternalMorningBriefTask({ title: "Finish investor proposal" }),
    ).toBe(false);
  });

  it("allows an explicitly selected internal task through focus override", () => {
    const title = "Reconnect Microsoft to Jarvis";

    expect(taskMatchesCurrentFocus(title, title)).toBe(true);
    expect(
      shouldIncludeTaskInMorningBriefSelection({ title }, title),
    ).toBe(true);
  });

  it("does not treat due date alone as meaningful importance", () => {
    expect(
      isMeaningfulMorningBriefDeadlineTask({
        title: "Test approval workflow",
        priority: "medium",
        overdue: false,
        dueToday: true,
        currentFocus: null,
      }),
    ).toBe(false);
    expect(
      isMeaningfulMorningBriefDeadlineTask({
        title: "Finish investor proposal",
        priority: "high",
        overdue: false,
        dueToday: true,
        currentFocus: null,
      }),
    ).toBe(true);
  });
});
