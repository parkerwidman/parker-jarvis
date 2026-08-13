import { describe, expect, it } from "vitest";
import {
  dateOnlyToUtcNoonIso,
  parseGoalTargetDateInput,
  parseTaskDueDateInput,
} from "./goal-dates";

describe("goal dates", () => {
  it("accepts optional goal target dates", () => {
    expect(parseGoalTargetDateInput(null)).toBeNull();
    expect(parseGoalTargetDateInput("")).toBeNull();
    expect(parseGoalTargetDateInput("2026-09-30")).toBe("2026-09-30");
    expect(parseGoalTargetDateInput("bad-date")).toBeNull();
  });

  it("stores task due dates at UTC noon to avoid day shifts", () => {
    expect(parseTaskDueDateInput("2026-08-12")).toBe(dateOnlyToUtcNoonIso("2026-08-12"));
  });
});
