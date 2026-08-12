import { buildFitnessInsight } from "@/lib/jarvis/fitness/fitness-insight";
import type {
  FitnessRecoverySnapshot,
  FitnessSleepSnapshot,
} from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessInsightCardProps = {
  recovery: FitnessRecoverySnapshot | null;
  sleep: FitnessSleepSnapshot | null;
};

export function FitnessInsightCard({ recovery, sleep }: FitnessInsightCardProps) {
  const insight = buildFitnessInsight({ recovery, sleep });

  return (
    <section className="fit-rail-card fit-rail-card--insight" aria-label="AI fitness insight">
      <header className="fit-insight-head">
        <span className="fit-insight-icon" aria-hidden="true">
          ✦
        </span>
        <h2 className="fit-rail-eyebrow">AI Fitness Insight</h2>
      </header>
      <p className="fit-insight-copy">{insight.message}</p>
      <div className="fit-insight-focus" aria-label={`Focus: ${insight.focus}`}>
        Focus: {insight.focus}
      </div>
    </section>
  );
}
