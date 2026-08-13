const ORB_TICKS = [
  { x1: 50, y1: 4, x2: 50, y2: 12 },
  { x1: 50, y1: 88, x2: 50, y2: 96 },
  { x1: 4, y1: 50, x2: 12, y2: 50 },
  { x1: 88, y1: 50, x2: 96, y2: 50 },
  { x1: 17, y1: 17, x2: 22.5, y2: 22.5 },
  { x1: 77.5, y1: 17, x2: 83, y2: 22.5 },
  { x1: 17, y1: 77.5, x2: 22.5, y2: 83 },
  { x1: 77.5, y1: 77.5, x2: 83, y2: 83 },
  { x1: 28, y1: 8.5, x2: 30.5, y2: 11 },
  { x1: 69.5, y1: 8.5, x2: 72, y2: 11 },
  { x1: 28, y1: 89, x2: 30.5, y2: 91.5 },
  { x1: 69.5, y1: 89, x2: 72, y2: 91.5 },
] as const;

const ORB_DOTS = [
  { cx: 50, cy: 7 },
  { cx: 73, cy: 21 },
  { cx: 86, cy: 42 },
  { cx: 79, cy: 67 },
  { cx: 58, cy: 86 },
  { cx: 33, cy: 86 },
  { cx: 14, cy: 67 },
  { cx: 8, cy: 42 },
  { cx: 21, cy: 21 },
] as const;

export function MelusiHeroOrb() {
  return (
    <div className="melusi-hero-orb" aria-hidden="true">
      <svg className="melusi-hero-orb-svg" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="melusi-orb-ring" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#4DA3FF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7C6CFF" stopOpacity="0.65" />
          </linearGradient>
          <radialGradient id="melusi-orb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.58" />
            <stop offset="55%" stopColor="#4DA3FF" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="melusi-orb-bloom" cx="50%" cy="42%" r="45%">
            <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#67E8F9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill="url(#melusi-orb-glow)" />
        <circle cx="50" cy="50" r="37" fill="url(#melusi-orb-bloom)" opacity="0.78" />
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="rgba(34,211,238,0.14)"
          strokeWidth="0.75"
          strokeDasharray="1.5 4.5"
        />
        <circle cx="50" cy="50" r="39" stroke="rgba(34,211,238,0.2)" strokeWidth="0.75" />
        <circle
          cx="50"
          cy="50"
          r="33"
          stroke="url(#melusi-orb-ring)"
          strokeWidth="2.25"
          strokeDasharray="150 32"
          transform="rotate(-92 50 50)"
        />
        <circle
          cx="50"
          cy="50"
          r="27"
          stroke="rgba(34,211,238,0.16)"
          strokeWidth="0.75"
          strokeDasharray="3 7"
        />
        <circle cx="50" cy="50" r="21" stroke="rgba(125,211,252,0.12)" strokeWidth="0.5" />
        {ORB_DOTS.map((dot, index) => (
          <circle
            key={`dot-${index}`}
            cx={dot.cx}
            cy={dot.cy}
            r="1.05"
            fill="rgba(125,211,252,0.55)"
          />
        ))}
        {ORB_TICKS.map((tick, index) => (
          <line
            key={`tick-${index}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(34,211,238,0.48)"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        ))}
        <circle cx="50" cy="50" r="19" fill="rgba(5,7,10,0.92)" />
        <circle cx="50" cy="50" r="19" stroke="rgba(34,211,238,0.28)" strokeWidth="0.85" />
        <g transform="translate(50 50) scale(1.14) translate(-50 -50)">
          <path
            d="M50 28.5l3.8 10.9H64.8l-8.9 6.5 3.4 10.9L50 48.8l-9.6 6.6 3.4-10.9-8.9-6.5h11.3L50 28.5z"
            fill="#22D3EE"
            fillOpacity="0.98"
          />
          <path
            d="M50 33l2.5 7.4H59.2l-5.8 4.2 2.3 7.4L50 47.2l-5.3 3.8 2.3-7.4-5.8-4.2h6.8L50 33z"
            fill="#A5F3FC"
            fillOpacity="0.38"
          />
        </g>
      </svg>
    </div>
  );
}
