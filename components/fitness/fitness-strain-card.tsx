import {
  FitnessMetricCard,
  FitnessMetricRow,
  StrainIcon,
} from "@/components/fitness/fitness-metric-card";
import type { FitnessCycleSnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessStrainCardProps = {
  cycle: FitnessCycleSnapshot | null;
};

export function FitnessStrainCard({ cycle }: FitnessStrainCardProps) {
  if (!cycle) {
    return (
      <FitnessMetricCard title="Day Strain" accent="strain" icon={<StrainIcon />}>
        <p className="fit-empty-copy">Day strain not recorded yet.</p>
      </FitnessMetricCard>
    );
  }

  if (cycle.displayState === "pending") {
    return (
      <FitnessMetricCard title="Day Strain" accent="strain" icon={<StrainIcon />}>
        <p className="fit-state-copy">Strain pending</p>
        {cycle.isCurrent ? (
          <p className="fit-metric-subtitle">Current cycle</p>
        ) : null}
      </FitnessMetricCard>
    );
  }

  if (cycle.displayState === "unscorable") {
    return (
      <FitnessMetricCard title="Day Strain" accent="strain" icon={<StrainIcon />}>
        <p className="fit-state-copy">Strain unavailable</p>
      </FitnessMetricCard>
    );
  }

  return (
    <FitnessMetricCard title="Day Strain" accent="strain" icon={<StrainIcon />}>
      <div className="fit-metric-hero">
        <div className="fit-metric-score">
          {cycle.strain != null ? cycle.strain.toFixed(1) : "—"}
        </div>
        <p className="fit-metric-subtitle">
          {cycle.isCurrent ? "Current cycle strain" : "Cycle strain"}
        </p>
      </div>
      <div className="fit-metric-rows">
        <FitnessMetricRow
          label="Average HR"
          value={
            cycle.averageHeartRate != null
              ? `${cycle.averageHeartRate} bpm`
              : null
          }
        />
        <FitnessMetricRow
          label="Max HR"
          value={cycle.maxHeartRate != null ? `${cycle.maxHeartRate} bpm` : null}
        />
        <FitnessMetricRow
          label="Calories"
          value={cycle.kilocalories != null ? `${cycle.kilocalories} kcal` : null}
        />
      </div>
    </FitnessMetricCard>
  );
}
