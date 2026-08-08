import { describe, expect, it } from "vitest";

import {
  generateRitualStars,
  SLEEP_STARFIELD,
  WELCOME_STARFIELD,
} from "@/lib/jarvis/morning-ritual/starfield";

describe("generateRitualStars", () => {
  it("returns deterministic starfields for the same seed", () => {
    const first = generateRitualStars("morning-ritual-sleep-v1", 55);
    const second = generateRitualStars("morning-ritual-sleep-v1", 55);

    expect(first).toEqual(second);
  });

  it("returns different starfields for different seeds", () => {
    const sleep = generateRitualStars("morning-ritual-sleep-v1", 55);
    const welcome = generateRitualStars("morning-ritual-welcome-v1", 45);

    expect(sleep).not.toEqual(welcome);
  });

  it("exports the expected sleep and welcome star counts", () => {
    expect(SLEEP_STARFIELD).toHaveLength(55);
    expect(WELCOME_STARFIELD).toHaveLength(45);
  });

  it("uses only 1px and 2px star sizes", () => {
    for (const star of SLEEP_STARFIELD) {
      expect([1, 2]).toContain(star.size);
      expect(star.duration).toBeGreaterThanOrEqual(2);
      expect(star.duration).toBeLessThanOrEqual(5);
    }
  });
});
