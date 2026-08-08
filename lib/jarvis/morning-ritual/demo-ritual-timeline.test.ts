import { describe, expect, it } from "vitest";

import {
  DEMO_RITUAL_TRANSCRIPT,
  formatRitualDate,
  getDemoRitualSnapshot,
} from "@/lib/jarvis/morning-ritual/demo-ritual-timeline";

describe("demo ritual timeline", () => {
  it("starts at sentence 0 with playing state", () => {
    const snapshot = getDemoRitualSnapshot(0);
    expect(snapshot.activeSentenceIndex).toBe(0);
    expect(snapshot.isPlaying).toBe(true);
    expect(snapshot.modeRevealed).toBe(false);
    expect(snapshot.isFinished).toBe(false);
  });

  it("advances sentences at prototype timestamps", () => {
    expect(getDemoRitualSnapshot(4999).activeSentenceIndex).toBe(0);
    expect(getDemoRitualSnapshot(5000).activeSentenceIndex).toBe(1);
    expect(getDemoRitualSnapshot(11000).activeSentenceIndex).toBe(2);
    expect(getDemoRitualSnapshot(16000).activeSentenceIndex).toBe(3);
  });

  it("reveals Melusi mode at 20 seconds", () => {
    const snapshot = getDemoRitualSnapshot(20000);
    expect(snapshot.activeSentenceIndex).toBe(4);
    expect(snapshot.recommendedMode).toBe("melusi");
    expect(snapshot.modeRevealed).toBe(true);
    expect(snapshot.isFinished).toBe(false);
  });

  it("finishes at 24 seconds", () => {
    const snapshot = getDemoRitualSnapshot(24000);
    expect(snapshot.isFinished).toBe(true);
    expect(snapshot.isPlaying).toBe(false);
  });

  it("formats ritual dates human-readably without hardcoding August 7", () => {
    expect(formatRitualDate("2026-03-15")).toBe("Sunday, March 15, 2026");
    expect(formatRitualDate("2026-08-07")).toBe("Friday, August 7, 2026");
  });

  it("exports five demo transcript sentences", () => {
    expect(DEMO_RITUAL_TRANSCRIPT).toHaveLength(5);
  });
});
