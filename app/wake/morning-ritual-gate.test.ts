import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GATE_PATH = resolve(
  import.meta.dirname,
  "../../components/jarvis/morning-ritual/morning-ritual-gate.tsx",
);

describe("MorningRitualGate phase 2 shell", () => {
  it("renders full_required and welcome_back placeholders without bypass controls", () => {
    const source = readFileSync(GATE_PATH, "utf8");

    expect(source).toContain("Good morning,");
    expect(source).toContain("Welcome back,");
    expect(source).toContain('data-ritual-state={entry.ritualState}');
    expect(source).not.toMatch(/Enter Jarvis/i);
    expect(source).not.toMatch(/audio/i);
    expect(source).not.toMatch(/transcript/i);
    expect(source).not.toMatch(/startDailyRitual/);
    expect(source).not.toMatch(/completeDailyRitual/);
  });
});
