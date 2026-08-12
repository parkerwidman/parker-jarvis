import {
  FitnessMetricCard,
  FitnessMetricRow,
  WorkoutIcon,
} from "@/components/fitness/fitness-metric-card";
import type { FitnessWorkoutSnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessWorkoutsCardProps = {
  workouts: FitnessWorkoutSnapshot[];
};

function WorkoutEmptyVisual() {
  return (
    <div className="fit-workout-empty-visual" aria-hidden="true">
      <svg className="fit-workout-empty-icon" viewBox="0 0 120 64" fill="none">
        <path
          d="M18 32h12M90 32h12M34 28v8M86 28v8M48 32h24"
          stroke="rgba(34,211,238,0.18)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M58 18c-8 0-14 6-14 14s6 14 14 14 14-6 14-14-6-14-14-14z"
          stroke="rgba(34,211,238,0.12)"
          strokeWidth="1.5"
        />
        <path
          d="M52 46c4 3 12 3 16 0"
          stroke="rgba(34,211,238,0.1)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function FitnessWorkoutsCard({ workouts }: FitnessWorkoutsCardProps) {
  return (
    <FitnessMetricCard
      title="Today's Workouts"
      accent="workout"
      icon={<WorkoutIcon />}
      className="fit-card--wide"
    >
      {workouts.length === 0 ? (
        <div className="fit-workout-empty">
          <WorkoutEmptyVisual />
          <p className="fit-workout-empty-title">No workouts recorded today.</p>
          <p className="fit-workout-empty-subtitle">Rest. Recover. Recharge.</p>
        </div>
      ) : (
        <ul className="fit-workout-list">
          {workouts.map((workout) => (
            <li
              key={`${workout.startAt}-${workout.sportName}`}
              className="fit-workout-item"
            >
              <div className="fit-workout-item-head">
                <p className="fit-workout-name">{workout.sportName}</p>
                <p className="fit-workout-time">{workout.startTimeLabel}</p>
              </div>
              <div className="fit-metric-rows">
                <FitnessMetricRow label="Duration" value={workout.durationLabel} />
                <FitnessMetricRow
                  label="Strain"
                  value={
                    workout.strain != null ? workout.strain.toFixed(1) : "Pending"
                  }
                />
                <FitnessMetricRow
                  label="Average HR"
                  value={
                    workout.averageHeartRate != null
                      ? `${workout.averageHeartRate} bpm`
                      : null
                  }
                />
                <FitnessMetricRow
                  label="Max HR"
                  value={
                    workout.maxHeartRate != null ? `${workout.maxHeartRate} bpm` : null
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </FitnessMetricCard>
  );
}
