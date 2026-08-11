import { describe, expect, it } from "vitest";

import {
  formatSleepDuration,
  formatSyncFreshness,
  getRecoveryStatus,
  kilogramsToPounds,
  kilojoulesToKilocalories,
} from "@/lib/jarvis/fitness/fitness-display-utils";

describe("fitness display utils", () => {
  it("labels recovery status at score boundaries", () => {
    expect(getRecoveryStatus(33).label).toBe("Low");
    expect(getRecoveryStatus(34).label).toBe("Moderate");
    expect(getRecoveryStatus(66).label).toBe("Moderate");
    expect(getRecoveryStatus(67).label).toBe("Strong");
  });

  it("formats sleep duration from milliseconds", () => {
    expect(formatSleepDuration(27_720_000)).toBe("7h 42m");
  });

  it("converts kilojoules to kilocalories", () => {
    expect(kilojoulesToKilocalories(4184)).toBe(1000);
  });

  it("converts kilograms to pounds", () => {
    expect(kilogramsToPounds(90.7)).toBe(200);
  });

  it("formats sync freshness without requiring live timers", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");

    expect(formatSyncFreshness(null, "America/Chicago", now)).toBe("Never synced");
    expect(
      formatSyncFreshness("2026-08-11T11:59:30.000Z", "America/Chicago", now),
    ).toBe("Just synced");
    expect(
      formatSyncFreshness("2026-08-11T11:48:00.000Z", "America/Chicago", now),
    ).toBe("12 minutes ago");
    expect(
      formatSyncFreshness("2026-08-10T12:00:00.000Z", "America/Chicago", now),
    ).toBe("Yesterday");
  });
});
