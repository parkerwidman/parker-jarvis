import type {
  FitnessRecoverySnapshot,
  FitnessSleepSnapshot,
} from "@/lib/jarvis/fitness/fitness-today-types";

export type FitnessInsightFocus =
  | "Recovery"
  | "Balanced Day"
  | "Train"
  | "Sleep"
  | "Data";

export type FitnessInsight = {
  message: string;
  focus: FitnessInsightFocus;
};

const POOR_SLEEP_PERFORMANCE_THRESHOLD = 50;
const STRONG_RECOVERY_THRESHOLD = 67;
const LOW_RECOVERY_THRESHOLD = 34;

function isPoorSleep(sleep: FitnessSleepSnapshot | null): boolean {
  if (!sleep || sleep.displayState !== "scored") {
    return false;
  }

  return (
    sleep.performancePct != null &&
    sleep.performancePct < POOR_SLEEP_PERFORMANCE_THRESHOLD
  );
}

function isLowRecovery(recovery: FitnessRecoverySnapshot | null): boolean {
  if (!recovery || recovery.displayState !== "scored" || recovery.score == null) {
    return false;
  }

  return recovery.score < LOW_RECOVERY_THRESHOLD;
}

function isStrongRecovery(recovery: FitnessRecoverySnapshot | null): boolean {
  if (!recovery || recovery.displayState !== "scored" || recovery.score == null) {
    return false;
  }

  return recovery.score >= STRONG_RECOVERY_THRESHOLD;
}

function isStrongSleep(sleep: FitnessSleepSnapshot | null): boolean {
  if (!sleep || sleep.displayState !== "scored") {
    return false;
  }

  return (
    sleep.performancePct != null &&
    sleep.performancePct >= POOR_SLEEP_PERFORMANCE_THRESHOLD
  );
}

export function buildFitnessInsight(params: {
  recovery: FitnessRecoverySnapshot | null;
  sleep: FitnessSleepSnapshot | null;
}): FitnessInsight {
  const { recovery, sleep } = params;
  const recoveryScored = recovery?.displayState === "scored";
  const sleepScored = sleep?.displayState === "scored";

  if (!recoveryScored && !sleepScored) {
    return {
      message:
        "Connect and sync WHOOP to unlock recovery and sleep guidance here.",
      focus: "Data",
    };
  }

  if (isLowRecovery(recovery) && isPoorSleep(sleep)) {
    return {
      message:
        "Recovery is low and sleep was limited. Prioritize rest, hydration, and light movement to support recovery.",
      focus: "Recovery",
    };
  }

  if (isLowRecovery(recovery) && sleepScored && !isPoorSleep(sleep)) {
    return {
      message:
        "Recovery remains limited even with decent sleep. Keep training intensity controlled and prioritize recovery habits today.",
      focus: "Recovery",
    };
  }

  if (isLowRecovery(recovery)) {
    return {
      message:
        "Recovery is low today. Focus on rest, hydration, and lighter movement to rebuild readiness.",
      focus: "Recovery",
    };
  }

  if (isPoorSleep(sleep)) {
    return {
      message:
        "Sleep performance was limited. Protect tonight's sleep window and keep today's load manageable.",
      focus: "Sleep",
    };
  }

  if (isStrongRecovery(recovery) && isStrongSleep(sleep)) {
    return {
      message:
        "Recovery and sleep look strong. You're in a good position for productive training if your plan calls for it.",
      focus: "Train",
    };
  }

  if (recoveryScored || sleepScored) {
    return {
      message:
        "Recovery and sleep are in a moderate range. Balance effort with rest and stay consistent with hydration and movement.",
      focus: "Balanced Day",
    };
  }

  return {
    message: "Sync WHOOP to refresh your fitness insight.",
    focus: "Data",
  };
}

export function buildRecoveryStatusMessage(
  recovery: FitnessRecoverySnapshot | null,
): string {
  if (!recovery || recovery.displayState !== "scored" || recovery.score == null) {
    return "Recovery data will appear after your next WHOOP sync.";
  }

  if (recovery.score < LOW_RECOVERY_THRESHOLD) {
    return "Focus on recovery today.";
  }

  if (recovery.score < STRONG_RECOVERY_THRESHOLD) {
    return "Balance recovery and training today.";
  }

  return "You're primed for a stronger training day.";
}
