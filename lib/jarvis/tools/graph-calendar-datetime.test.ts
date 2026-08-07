import { describe, expect, it } from "vitest";
import {
  getGraphCalendarLocalDate,
  parseGraphCalendarDateTime,
} from "@/lib/jarvis/tools/graph-calendar-datetime";

describe("graph calendar datetime", () => {
  it("interprets naive Microsoft Graph datetimes in the configured timezone", () => {
    const parsed = parseGraphCalendarDateTime(
      "2026-08-06T15:00:00",
      "America/Chicago",
    );

    expect(parsed.toISOString()).toBe("2026-08-06T20:00:00.000Z");
    expect(getGraphCalendarLocalDate("2026-08-06T15:00:00", "America/Chicago")).toBe(
      "2026-08-06",
    );
  });

  it("keeps explicit offset datetimes unchanged", () => {
    const parsed = parseGraphCalendarDateTime(
      "2026-08-07T03:00:00.000Z",
      "America/Chicago",
    );

    expect(parsed.toISOString()).toBe("2026-08-07T03:00:00.000Z");
    expect(getGraphCalendarLocalDate("2026-08-07T03:00:00.000Z", "America/Chicago")).toBe(
      "2026-08-06",
    );
  });

  it("preserves all-day event dates without shifting to the prior day", () => {
    const localDate = getGraphCalendarLocalDate(
      "2026-08-07T00:00:00",
      "America/Chicago",
    );

    expect(localDate).toBe("2026-08-07");
  });
});
