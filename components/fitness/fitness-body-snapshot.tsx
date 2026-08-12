import {
  BodyIcon,
  FitnessMetricCard,
  FitnessMetricRow,
} from "@/components/fitness/fitness-metric-card";
import type { FitnessBodySnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessBodySnapshotCardProps = {
  body: FitnessBodySnapshot | null;
};

function BodyWireframe() {
  return (
    <svg
      className="fit-body-wireframe"
      viewBox="0 0 240 48"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d="M0 38 L30 28 L60 34 L90 22 L120 30 L150 18 L180 26 L210 20 L240 32"
        stroke="rgba(167,139,250,0.16)"
        strokeWidth="1"
      />
      <path
        d="M0 44 L40 36 L80 40 L120 32 L160 38 L200 30 L240 42"
        stroke="rgba(124,108,255,0.1)"
        strokeWidth="1"
      />
      <path
        d="M20 12 L60 8 L100 16 L140 10 L180 14 L220 8"
        stroke="rgba(167,139,250,0.08)"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
    </svg>
  );
}

export function FitnessBodySnapshotCard({ body }: FitnessBodySnapshotCardProps) {
  if (!body) {
    return (
      <FitnessMetricCard title="Body Snapshot" accent="body" icon={<BodyIcon />}>
        <p className="fit-empty-copy">Body measurements not available yet.</p>
        <BodyWireframe />
      </FitnessMetricCard>
    );
  }

  return (
    <FitnessMetricCard title="Body Snapshot" accent="body" icon={<BodyIcon />}>
      <div className="fit-metric-rows fit-metric-rows--body">
        <FitnessMetricRow
          label="Weight"
          value={
            body.weightPounds != null
              ? `${body.weightPounds} lb${
                  body.weightKilograms != null
                    ? ` (${body.weightKilograms.toFixed(1)} kg)`
                    : ""
                }`
              : null
          }
        />
        <FitnessMetricRow
          label="Max heart rate"
          value={body.maxHeartRate != null ? `${body.maxHeartRate} bpm` : null}
        />
      </div>
      <BodyWireframe />
    </FitnessMetricCard>
  );
}
