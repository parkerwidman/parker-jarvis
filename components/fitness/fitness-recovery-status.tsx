import { buildRecoveryStatusMessage } from "@/lib/jarvis/fitness/fitness-insight";
import type { FitnessRecoverySnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessRecoveryStatusProps = {
  recovery: FitnessRecoverySnapshot | null;
};

const RECOVERY_RING_CIRCUMFERENCE = 427;
const RECOVERY_RING_RADIUS = 68;

const RECOVERY_RING_DOTS = [
  { cx: "168", cy: "90" },
  { cx: "145.1543", cy: "145.1543" },
  { cx: "90", cy: "168" },
  { cx: "34.8457", cy: "145.1543" },
  { cx: "12", cy: "90" },
  { cx: "34.8457", cy: "34.8457" },
  { cx: "90", cy: "12" },
  { cx: "145.1543", cy: "34.8457" },
] as const;

function getRecoveryRingDash(score: number | null): string {
  if (score == null) {
    return `0 ${RECOVERY_RING_CIRCUMFERENCE}`;
  }

  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * RECOVERY_RING_CIRCUMFERENCE);
  const empty = RECOVERY_RING_CIRCUMFERENCE - filled;

  return `${filled} ${empty}`;
}

function RecoveryHeartIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
      <path
        d="M7 10.5S1.5 7.2 1.5 4.4C1.5 2.9 2.7 1.8 4.1 1.8c1 0 1.9.5 2.4 1.2.5-.7 1.4-1.2 2.4-1.2 1.4 0 2.6 1.1 2.6 2.6C11.5 7.2 7 10.5 7 10.5z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FitnessRecoveryStatus({ recovery }: FitnessRecoveryStatusProps) {
  const score =
    recovery?.displayState === "scored" ? recovery.score : null;
  const statusLabel = recovery?.statusLabel ?? "—";
  const detail = buildRecoveryStatusMessage(recovery);
  const ringDash = getRecoveryRingDash(score);

  return (
    <section className="fit-rail-card fit-rail-card--recovery" aria-label="Recovery status">
      <header className="fit-rail-head">
        <h2 className="fit-rail-title">Recovery Status</h2>
        <span className="fit-rail-info" aria-hidden="true">
          i
        </span>
      </header>

      <div className="fit-recovery-ring-wrap">
        <svg
          className="fit-recovery-ring-svg"
          viewBox="0 0 180 180"
          role="img"
          aria-label={
            score != null
              ? `Recovery score ${score} out of 100, ${statusLabel}`
              : "Recovery score unavailable"
          }
        >
          <defs>
            <linearGradient id="fit-recovery-ring-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="35%" stopColor="#4DA3FF" />
              <stop offset="68%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#F87171" />
            </linearGradient>
          </defs>
          <circle
            cx="90"
            cy="90"
            r="78"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
            strokeDasharray="2 7"
          />
          {RECOVERY_RING_DOTS.map((dot, index) => (
            <circle
              key={index}
              cx={dot.cx}
              cy={dot.cy}
              r="1"
              fill="rgba(125,185,255,0.28)"
            />
          ))}
          <circle
            cx="90"
            cy="90"
            r={RECOVERY_RING_RADIUS}
            fill="rgba(5,7,10,0.92)"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
          <circle
            cx="90"
            cy="90"
            r={RECOVERY_RING_RADIUS}
            fill="none"
            stroke="url(#fit-recovery-ring-gradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={ringDash}
            transform="rotate(-110 90 90)"
          />
        </svg>
        <div className="fit-recovery-ring-label">
          <span className="fit-recovery-ring-score">
            {score ?? "—"}
            <span className="fit-recovery-ring-denom">/100</span>
          </span>
          <span className="fit-recovery-ring-status">{statusLabel}</span>
          <span className="fit-recovery-ring-heart">
            <RecoveryHeartIcon />
          </span>
        </div>
      </div>

      <p className="fit-recovery-detail">{detail}</p>
    </section>
  );
}
