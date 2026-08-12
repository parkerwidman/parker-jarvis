import { describe, expect, it } from "vitest";

import {
  buildFitnessInsight,
  buildRecoveryStatusMessage,
} from "@/lib/jarvis/fitness/fitness-insight";
import type {
  FitnessRecoverySnapshot,
  FitnessSleepSnapshot,
} from "@/lib/jarvis/fitness/fitness-today-types";

function recovery(score: number): FitnessRecoverySnapshot {
  return {
    displayState: "scored",
    scoreState: "SCORED",
    score,
    statusLabel: score >= 67 ? "Strong" : score >= 34 ? "Moderate" : "Low",
    statusLevel: score >= 67 ? "strong" : score >= 34 ? "moderate" : "low",
    hrvMilli: 70,
    restingHeartRate: 55,
    spo2: 96,
    skinTempCelsius: 33,
  };
}

function sleep(performancePct: number): FitnessSleepSnapshot {
  return {
    displayState: "scored",
    scoreState: "SCORED",
    performancePct,
    totalSleepMs: 6 * 60 * 60 * 1000,
    totalSleepLabel: "6h 0m",
    efficiencyPct: 95,
    consistencyPct: 80,
    respiratoryRate: 14,
    sleepNeedBaselineMs: 8 * 60 * 60 * 1000,
    isNap: false,
  };
}

describe("buildFitnessInsight", () => {
  it("surfaces recovery guidance for low recovery and poor sleep", () => {
    const insight = buildFitnessInsight({
      recovery: recovery(28),
      sleep: sleep(40),
    });

    expect(insight.focus).toBe("Recovery");
    expect(insight.message).toContain("Recovery is low");
    expect(insight.message).toContain("sleep was limited");
  });

  it("surfaces train guidance for strong recovery and sleep", () => {
    const insight = buildFitnessInsight({
      recovery: recovery(82),
      sleep: sleep(88),
    });

    expect(insight.focus).toBe("Train");
    expect(insight.message).toContain("Recovery and sleep look strong");
  });

  it("returns a neutral message when data is missing", () => {
    const insight = buildFitnessInsight({
      recovery: null,
      sleep: null,
    });

    expect(insight.focus).toBe("Data");
    expect(insight.message).toContain("Connect and sync WHOOP");
  });
});

describe("buildRecoveryStatusMessage", () => {
  it("returns low recovery guidance", () => {
    expect(buildRecoveryStatusMessage(recovery(20))).toBe(
      "Focus on recovery today.",
    );
  });

  it("returns unavailable guidance when recovery is missing", () => {
    expect(buildRecoveryStatusMessage(null)).toContain("Recovery data will appear");
  });
});
