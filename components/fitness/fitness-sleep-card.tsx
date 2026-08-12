import {
  FitnessMetricCard,
  FitnessMetricRow,
  SleepIcon,
} from "@/components/fitness/fitness-metric-card";
import type { FitnessSleepSnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessSleepCardProps = {
  sleep: FitnessSleepSnapshot | null;
};

export function FitnessSleepCard({ sleep }: FitnessSleepCardProps) {
  if (!sleep) {
    return (
      <FitnessMetricCard title="Sleep" accent="sleep" icon={<SleepIcon />}>
        <p className="fit-empty-copy">
          Sleep not recorded yet. More history will appear as WHOOP collects data.
        </p>
      </FitnessMetricCard>
    );
  }

  if (sleep.displayState === "pending") {
    return (
      <FitnessMetricCard title="Sleep" accent="sleep" icon={<SleepIcon />}>
        <p className="fit-state-copy">Sleep pending</p>
      </FitnessMetricCard>
    );
  }

  if (sleep.displayState === "unscorable") {
    return (
      <FitnessMetricCard title="Sleep" accent="sleep" icon={<SleepIcon />}>
        <p className="fit-state-copy">Sleep unavailable</p>
      </FitnessMetricCard>
    );
  }

  return (
    <FitnessMetricCard
      title={sleep.isNap ? "Sleep (Nap)" : "Sleep"}
      accent="sleep"
      icon={<SleepIcon />}
    >
      <div className="fit-metric-hero">
        <div className="fit-metric-score">
          {sleep.performancePct != null
            ? `${Math.round(sleep.performancePct)}%`
            : "—"}
        </div>
        <p className="fit-metric-subtitle">Sleep performance</p>
      </div>
      <div className="fit-metric-rows">
        <FitnessMetricRow label="Total sleep" value={sleep.totalSleepLabel} />
        <FitnessMetricRow
          label="Efficiency"
          value={
            sleep.efficiencyPct != null
              ? `${Math.round(sleep.efficiencyPct)}%`
              : null
          }
        />
        <FitnessMetricRow
          label="Consistency"
          value={
            sleep.consistencyPct != null
              ? `${Math.round(sleep.consistencyPct)}%`
              : null
          }
        />
        <FitnessMetricRow
          label="Respiratory rate"
          value={
            sleep.respiratoryRate != null
              ? `${sleep.respiratoryRate.toFixed(1)} rpm`
              : null
          }
        />
        <FitnessMetricRow
          label="Sleep need baseline"
          value={
            sleep.sleepNeedBaselineMs != null
              ? `${Math.round(sleep.sleepNeedBaselineMs / 3_600_000)}h baseline`
              : null
          }
        />
      </div>
    </FitnessMetricCard>
  );
}
