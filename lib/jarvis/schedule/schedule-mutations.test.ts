import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  computeThisAndFutureEndDate,
  overrideEligibleForNewRecurrence,
  requiresRecurringDeleteScope,
  requiresRecurringSaveScope,
  shouldMoveOccurrenceToDate,
} from "@/lib/jarvis/schedule/schedule-mutation-logic";
import {
  validateRecurringCreateInput,
  validateScheduleBlockForm,
} from "@/lib/jarvis/schedule/schedule-validation";
import {
  SCHEDULE_GRID_END_HOUR,
  SCHEDULE_GRID_HEIGHT_PX,
  SCHEDULE_GRID_START_HOUR,
  SCHEDULE_HOUR_HEIGHT_PX,
} from "@/lib/jarvis/schedule/schedule-week-view";
import { FALL_2026_BASELINE_ITEMS } from "@/lib/jarvis/schedule/fall-2026-baseline-template";

const BOUNDS = { startDate: "2026-08-24", endDate: "2026-10-18" };

describe("schedule validation", () => {
  it("rejects blank titles", () => {
    expect(
      validateScheduleBlockForm(
        {
          title: "   ",
          category: "work",
          occurrenceDate: "2026-08-24",
          dayOfWeek: 0,
          startTime: "09:00",
          endTime: "10:00",
          isOpenEnded: false,
          notes: null,
        },
        BOUNDS,
      ),
    ).toBe("Title is required.");
  });

  it("rejects invalid categories", () => {
    expect(
      validateScheduleBlockForm(
        {
          title: "Work Block",
          category: "invalid" as never,
          occurrenceDate: "2026-08-24",
          dayOfWeek: 0,
          startTime: "09:00",
          endTime: "10:00",
          isOpenEnded: false,
          notes: null,
        },
        BOUNDS,
      ),
    ).toBe("Choose a supported category.");
  });

  it("rejects out-of-schedule dates", () => {
    expect(
      validateScheduleBlockForm(
        {
          title: "Work Block",
          category: "work",
          occurrenceDate: "2026-11-01",
          dayOfWeek: 0,
          startTime: "09:00",
          endTime: "10:00",
          isOpenEnded: false,
          notes: null,
        },
        BOUNDS,
      ),
    ).toBe("Date must fall within the selected schedule period.");
  });

  it("rejects invalid finite time ranges", () => {
    expect(
      validateScheduleBlockForm(
        {
          title: "Work Block",
          category: "work",
          occurrenceDate: "2026-08-24",
          dayOfWeek: 0,
          startTime: "10:00",
          endTime: "09:00",
          isOpenEnded: false,
          notes: null,
        },
        BOUNDS,
      ),
    ).toBe("End time must be after start time.");
  });

  it("accepts open-ended blocks", () => {
    expect(
      validateScheduleBlockForm(
        {
          title: "Lights Out",
          category: "sleep",
          occurrenceDate: "2026-08-24",
          dayOfWeek: 0,
          startTime: "22:30",
          endTime: null,
          isOpenEnded: true,
          notes: null,
        },
        BOUNDS,
      ),
    ).toBeNull();
  });

  it("validates recurring create start dates", () => {
    expect(
      validateRecurringCreateInput(
        {
          scheduleId: "00000000-0000-4000-8000-000000000001",
          title: "Work Block",
          category: "work",
          occurrenceDate: "2026-08-24",
          dayOfWeek: 0,
          startTime: "09:00",
          endTime: "12:00",
          isOpenEnded: false,
          notes: null,
          effectiveStartDate: "2026-08-24",
        },
        BOUNDS,
      ),
    ).toBeNull();
  });
});

describe("schedule mutation logic", () => {
  it("computes this-and-future end dates as split date minus one day", () => {
    expect(computeThisAndFutureEndDate("2026-09-16")).toBe("2026-09-15");
  });

  it("requires save scope for recurring blocks but not one-offs", () => {
    expect(requiresRecurringSaveScope("recurring", "item-id")).toBe(true);
    expect(requiresRecurringSaveScope("replaced", "item-id")).toBe(true);
    expect(requiresRecurringSaveScope("added", null)).toBe(false);
  });

  it("requires delete scope for recurring blocks but not one-offs", () => {
    expect(requiresRecurringDeleteScope("recurring", "item-id")).toBe(true);
    expect(requiresRecurringDeleteScope("added", null)).toBe(false);
  });

  it("detects cross-date moves", () => {
    expect(shouldMoveOccurrenceToDate("2026-09-09", "2026-09-10")).toBe(true);
    expect(shouldMoveOccurrenceToDate("2026-09-09", "2026-09-09")).toBe(false);
  });

  it("migrates future overrides only when weekday matches new recurrence", () => {
    expect(overrideEligibleForNewRecurrence("2026-09-15", "2026-09-16", 2)).toBe(
      false,
    );
    expect(overrideEligibleForNewRecurrence("2026-09-16", "2026-09-16", 2)).toBe(
      true,
    );
    expect(overrideEligibleForNewRecurrence("2026-09-16", "2026-09-16", 4)).toBe(
      false,
    );
  });
});

describe("schedule editor UX structure", () => {
  it("keeps grid cards free of permanent edit controls", () => {
    const block = readFileSync("components/schedule/schedule-block.tsx", "utf8");
    const grid = readFileSync("components/schedule/schedule-week-grid.tsx", "utf8");

    expect(block).not.toContain("Edit");
    expect(block).not.toContain("Delete");
    expect(block).not.toContain("schedule-block-action");
    expect(grid).not.toContain("Add Block");
  });

  it("uses exactly one top-level Add Block control", () => {
    const dashboard = readFileSync(
      "components/schedule/schedule-dashboard.tsx",
      "utf8",
    );

    expect(dashboard.match(/\+ Add Block/g)?.length).toBe(1);
  });

  it("keeps delete inside the editor", () => {
    const editor = readFileSync("components/schedule/schedule-editor.tsx", "utf8");

    expect(editor).toContain("Delete Block");
    expect(editor).toContain("Save Changes");
    expect(editor).toContain("Cancel");
    expect(editor).toContain('step === "save_scope"');
    expect(editor).toContain('step === "delete_scope"');
  });

  it("does not expose scope selectors in the normal grid", () => {
    const grid = readFileSync("components/schedule/schedule-week-grid.tsx", "utf8");

    expect(grid).not.toContain("This date only");
    expect(grid).not.toContain("Entire series");
  });
});

describe("schedule geometry lock", () => {
  it("preserves approved D7.3 grid constants", () => {
    expect(SCHEDULE_GRID_START_HOUR).toBe(6);
    expect(SCHEDULE_GRID_END_HOUR).toBe(23);
    expect(SCHEDULE_HOUR_HEIGHT_PX).toBe(52);
    expect(SCHEDULE_GRID_HEIGHT_PX).toBe(884);
  });
});

describe("baseline integrity", () => {
  it("does not change the 54-item baseline template", () => {
    expect(FALL_2026_BASELINE_ITEMS).toHaveLength(54);
  });
});

describe("D7.4 schedule mutation migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260813110000_add_jarvis_schedule_mutation_rpcs.sql",
    "utf8",
  );

  it("creates SECURITY INVOKER schedule mutation RPCs with hardened search_path", () => {
    expect(migration).toContain("jarvis_schedule_upsert_replace_override");
    expect(migration).toContain("jarvis_schedule_skip_occurrence");
    expect(migration).toContain("jarvis_schedule_move_occurrence");
    expect(migration).toContain("jarvis_schedule_split_item_this_and_future");
    expect(migration).toContain("jarvis_schedule_end_item_this_and_future");
    expect(migration).toContain("jarvis_schedule_delete_item_entire_series");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("jarvis_schedule_item_effective_on_date");
    expect(migration).toContain(
      "public.jarvis_schedule_monday_zero_dow(occurrence_date) = p_day_of_week",
    );
    expect(migration).not.toContain("SECURITY DEFINER");
  });
});
