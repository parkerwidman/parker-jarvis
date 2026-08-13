import { MelusiHeartbeatIcon } from "@/components/melusi/melusi-icons";
import type { MelusiBusinessHealthState } from "@/lib/jarvis/melusi/build-melusi-business-health";

const HEALTH_DOTS = [
  { cx: 60, cy: 10 },
  { cx: 98, cy: 34 },
  { cx: 110, cy: 60 },
  { cx: 98, cy: 86 },
  { cx: 60, cy: 110 },
  { cx: 22, cy: 86 },
  { cx: 10, cy: 60 },
  { cx: 22, cy: 34 },
] as const;

const HEALTH_TICKS = [
  { x1: 60, y1: 4, x2: 60, y2: 10 },
  { x1: 60, y1: 110, x2: 60, y2: 116 },
  { x1: 4, y1: 60, x2: 10, y2: 60 },
  { x1: 110, y1: 60, x2: 116, y2: 60 },
  { x1: 24, y1: 24, x2: 28.5, y2: 28.5 },
  { x1: 91.5, y1: 24, x2: 96, y2: 28.5 },
  { x1: 24, y1: 91.5, x2: 28.5, y2: 96 },
  { x1: 91.5, y1: 91.5, x2: 96, y2: 96 },
] as const;

export function MelusiBusinessHealthVisual({
  state,
}: {
  state: MelusiBusinessHealthState;
}) {
  const ringClass =
    state === "needs_attention"
      ? "melusi-health-visual--warning"
      : state === "limited"
        ? "melusi-health-visual--limited"
        : "melusi-health-visual--optimal";

  return (
    <div className={`melusi-health-visual ${ringClass}`} aria-hidden="true">
      <svg className="melusi-health-visual-svg" viewBox="0 0 120 120" fill="none">
        <defs>
          <linearGradient id="melusi-health-ring-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="45%" stopColor="#4DA3FF" />
            <stop offset="100%" stopColor="#7C6CFF" />
          </linearGradient>
          <radialGradient id="melusi-health-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="56" fill="url(#melusi-health-glow)" />
        <circle
          cx="60"
          cy="60"
          r="56"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.75"
          strokeDasharray="2 5"
        />
        <circle
          cx="60"
          cy="60"
          r="48"
          stroke="rgba(34,211,238,0.08)"
          strokeWidth="0.5"
          strokeDasharray="1.5 6"
        />
        {HEALTH_TICKS.map((tick, index) => (
          <line
            key={`health-tick-${index}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(34,211,238,0.32)"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
        ))}
        {HEALTH_DOTS.map((dot, index) => (
          <circle
            key={`health-dot-${index}`}
            cx={dot.cx}
            cy={dot.cy}
            r="1.35"
            fill="rgba(125,211,252,0.48)"
          />
        ))}
        <circle cx="60" cy="60" r="47" stroke="rgba(34,211,238,0.14)" strokeWidth="0.75" />
        <circle cx="60" cy="60" r="41" fill="rgba(5,7,10,0.96)" />
        <circle
          cx="60"
          cy="60"
          r="41"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="0.75"
        />
        <circle
          cx="60"
          cy="60"
          r="41"
          fill="none"
          stroke="url(#melusi-health-ring-gradient)"
          strokeWidth="4.25"
          strokeLinecap="round"
          strokeDasharray="220 36"
          transform="rotate(-108 60 60)"
        />
        <circle cx="60" cy="60" r="31" stroke="rgba(34,211,238,0.18)" strokeWidth="0.75" />
        <circle cx="60" cy="60" r="23" stroke="rgba(34,211,238,0.12)" strokeWidth="0.75" />
        <circle
          cx="60"
          cy="60"
          r="15"
          stroke="rgba(125,211,252,0.08)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />
        <path d="M60 18v84M18 60h84" stroke="rgba(34,211,238,0.05)" strokeWidth="0.5" />
      </svg>
      <div className="melusi-health-visual-icon">
        <MelusiHeartbeatIcon />
      </div>
    </div>
  );
}
