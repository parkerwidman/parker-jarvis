import {
  FitnessMetricCard,
  FitnessMetricRow,
  RecoveryIcon,
} from "@/components/fitness/fitness-metric-card";
import type { FitnessRecoverySnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessRecoveryCardProps = {
  recovery: FitnessRecoverySnapshot | null;
};

function recoveryProgressClass(
  level: FitnessRecoverySnapshot["statusLevel"],
): string {
  if (level === "strong") {
    return "fit-progress-fill--strong";
  }

  if (level === "moderate") {
    return "fit-progress-fill--moderate";
  }

  return "fit-progress-fill--low";
}

export function FitnessRecoveryCard({ recovery }: FitnessRecoveryCardProps) {
  if (!recovery) {
    return (
      <FitnessMetricCard title="Recovery" accent="recovery" icon={<RecoveryIcon />}>
        <p className="fit-empty-copy">
          Recovery not recorded yet. More history will appear as WHOOP collects
          data.
        </p>
      </FitnessMetricCard>
    );
  }

  if (recovery.displayState === "pending") {
    return (
      <FitnessMetricCard title="Recovery" accent="recovery" icon={<RecoveryIcon />}>
        <p className="fit-state-copy">Recovery pending</p>
      </FitnessMetricCard>
    );
  }

  if (recovery.displayState === "unscorable") {
    return (
      <FitnessMetricCard title="Recovery" accent="recovery" icon={<RecoveryIcon />}>
        <p className="fit-state-copy">Recovery unavailable</p>
      </FitnessMetricCard>
    );
  }

  return (
    <FitnessMetricCard title="Recovery" accent="recovery" icon={<RecoveryIcon />}>
      <div className="fit-metric-hero">
        <div className="fit-metric-score">
          {recovery.score}
          <span className="fit-metric-denom">/ 100</span>
        </div>
        <p className="fit-metric-status fit-metric-status--recovery">
          {recovery.statusLabel}
        </p>
        <div
          className="fit-progress-track"
          role="progressbar"
          aria-valuenow={recovery.score ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Recovery score ${recovery.score} out of 100, ${recovery.statusLabel}`}
        >
          <div
            className={`fit-progress-fill ${recoveryProgressClass(recovery.statusLevel)}`}
            style={{
              width: `${Math.max(0, Math.min(100, recovery.score ?? 0))}%`,
            }}
          />
        </div>
      </div>
      <div className="fit-metric-rows">
        <FitnessMetricRow
          label="HRV"
          value={
            recovery.hrvMilli != null ? `${recovery.hrvMilli.toFixed(1)} ms` : null
          }
        />
        <FitnessMetricRow
          label="Resting HR"
          value={
            recovery.restingHeartRate != null
              ? `${Math.round(recovery.restingHeartRate)} bpm`
              : null
          }
        />
        <FitnessMetricRow
          label="SpO2"
          value={recovery.spo2 != null ? `${recovery.spo2.toFixed(1)}%` : null}
        />
        <FitnessMetricRow
          label="Skin temp"
          value={
            recovery.skinTempCelsius != null
              ? `${recovery.skinTempCelsius.toFixed(1)} °C`
              : null
          }
        />
      </div>
    </FitnessMetricCard>
  );
}
