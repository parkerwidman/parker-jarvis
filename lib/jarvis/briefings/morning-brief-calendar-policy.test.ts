import { describe, expect, it } from "vitest";
import {
  dedupeMorningBriefCalendarEvents,
  isMeaningfulMorningBriefCalendarEvent,
  isReminderOnlyCalendarEvent,
} from "@/lib/jarvis/briefings/morning-brief-calendar-policy";

const TODAY = "2026-08-06";

function buildEvent(
  overrides: Partial<Parameters<typeof isMeaningfulMorningBriefCalendarEvent>[0]> = {},
) {
  return {
    subject: "Investor sync",
    localDate: TODAY,
    localStart: "Thu, Aug 6, 2026, 2:00 PM CDT",
    localEnd: "Thu, Aug 6, 2026, 3:00 PM CDT",
    startIso: `${TODAY}T19:00:00.000Z`,
    endIso: `${TODAY}T20:00:00.000Z`,
    isAllDay: false,
    isCancelled: false,
    showAs: "busy",
    importance: "normal",
    locationName: null,
    ...overrides,
  };
}

describe("morning brief calendar policy", () => {
  it("excludes reminder-only and generic reminder events", () => {
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({ subject: "Reminder", startIso: `${TODAY}T08:00:00.000Z`, endIso: `${TODAY}T08:15:00.000Z` }),
      ),
    ).toBe(false);
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({
          subject: "Test reminder",
          startIso: "2026-08-07T08:00:00.000Z",
          endIso: "2026-08-07T08:15:00.000Z",
          localDate: "2026-08-07",
        }),
      ),
    ).toBe(false);
    expect(isReminderOnlyCalendarEvent(buildEvent({ subject: "Reminder" }))).toBe(true);
  });

  it("excludes internal integration and workflow test events", () => {
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({ subject: "Jarvis OAuth integration test" }),
      ),
    ).toBe(false);
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({ subject: "Test approval workflow" }),
      ),
    ).toBe(false);
  });

  it("keeps meaningful classes, meetings, appointments, and work blocks", () => {
    expect(
      isMeaningfulMorningBriefCalendarEvent(buildEvent({ subject: "Class" })),
    ).toBe(true);
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({ subject: "Doctor appointment", showAs: "busy" }),
      ),
    ).toBe(true);
    expect(
      isMeaningfulMorningBriefCalendarEvent(
        buildEvent({
          subject: "Deep work",
          startIso: `${TODAY}T14:00:00.000Z`,
          endIso: `${TODAY}T16:00:00.000Z`,
        }),
      ),
    ).toBe(true);
  });

  it("deduplicates repeated calendar events", () => {
    const deduped = dedupeMorningBriefCalendarEvents([
      buildEvent({ subject: "Class" }),
      buildEvent({ subject: "Class" }),
    ]);

    expect(deduped).toHaveLength(1);
  });
});
