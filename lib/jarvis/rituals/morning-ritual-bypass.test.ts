import { describe, expect, it, vi } from "vitest";

import {
  applyMorningRitualBypassCookie,
  getMorningRitualBypassCookieOptions,
  isMorningRitualBypassActive,
  isValidRitualDate,
  MORNING_RITUAL_BYPASS_COOKIE,
  shouldRedirectHomeToWake,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";

describe("morning ritual bypass", () => {
  it("accepts valid ritual dates", () => {
    expect(isValidRitualDate("2026-08-15")).toBe(true);
    expect(isValidRitualDate("2026-8-15")).toBe(false);
  });

  it("treats same-day bypass as active only for matching ritual dates", () => {
    expect(isMorningRitualBypassActive("2026-08-15", "2026-08-15")).toBe(true);
    expect(isMorningRitualBypassActive("2026-08-14", "2026-08-15")).toBe(false);
    expect(isMorningRitualBypassActive(null, "2026-08-15")).toBe(false);
  });

  it("redirects ritual-ready users without bypass to /wake", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "not_started",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
      }),
    ).toBe(true);
  });

  it("allows / when same-day bypass matches ritual date", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "not_started",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
        bypassRitualDate: "2026-08-15",
      }),
    ).toBe(false);
  });

  it("does not allow stale bypass from yesterday", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "started",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
        bypassRitualDate: "2026-08-14",
      }),
    ).toBe(true);
  });

  it("sets the same-day bypass cookie for a valid ritual date", () => {
    const cookieStore = { set: vi.fn() };

    expect(applyMorningRitualBypassCookie(cookieStore, "2026-08-15")).toBe(true);
    expect(cookieStore.set).toHaveBeenCalledWith(
      MORNING_RITUAL_BYPASS_COOKIE,
      "2026-08-15",
      getMorningRitualBypassCookieOptions(),
    );
  });

  it("does not set a bypass cookie for an invalid ritual date", () => {
    const cookieStore = { set: vi.fn() };

    expect(applyMorningRitualBypassCookie(cookieStore, "08-15-2026")).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not send a completed same-day ritual back to /wake when bypass matches", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "completed",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
        bypassRitualDate: "2026-08-15",
      }),
    ).toBe(false);
  });

  it("still sends a completed ritual to /wake without a same-day bypass", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "completed",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
      }),
    ).toBe(true);
  });

  it("preserves ritualEntry=complete validation", () => {
    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "not_started",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
        ritualEntry: "complete",
      }),
    ).toBe(true);

    expect(
      shouldRedirectHomeToWake({
        entry: {
          ritualStatus: "completed",
          playbackReadiness: "ready",
        },
        ritualDate: "2026-08-15",
        ritualEntry: "complete",
      }),
    ).toBe(false);
  });
});
