const ORBIT_DOTS = [
  { cx: "96", cy: "56" },
  { cx: "68.3607", cy: "94.0423" },
  { cx: "23.6393", cy: "79.5114" },
  { cx: "23.6393", cy: "32.4886" },
  { cx: "68.3607", cy: "17.9577" },
] as const;

type PriorityOrbitalProps = {
  variant?: "default" | "education";
};

function GraduationCapIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M3.5 10.5L13 6l9.5 4.5L13 15 3.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 12v4.5c0 1.2 2.9 2.5 6.5 2.5s6.5-1.3 6.5-2.5V12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M21 10.5v5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PriorityCenterIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5l1.8 4.2 4.6.4-3.5 3 1 4.4L12 15l-4 1.8 1-4.4-3.5-3 4.6-.4L12 5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PriorityOrbital({ variant = "default" }: PriorityOrbitalProps) {
  return (
    <div className="cc2-priority-orbital" aria-hidden="true">
      <div className="cc2-priority-orbital-glow" />
      <svg className="cc2-priority-orbital-svg" viewBox="0 0 112 112">
        <circle
          cx="56"
          cy="56"
          r="48"
          fill="none"
          stroke="rgba(77,163,255,0.18)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
        <circle
          cx="56"
          cy="56"
          r="40"
          fill="none"
          stroke="rgba(103,180,255,0.55)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="220 32"
          transform="rotate(-90 56 56)"
        />
        {ORBIT_DOTS.map((dot, index) => (
          <circle
            key={index}
            cx={dot.cx}
            cy={dot.cy}
            r="1.5"
            fill="rgba(125,212,255,0.65)"
          />
        ))}
      </svg>
      <div className="cc2-priority-orbital-core">
        {variant === "education" ? <GraduationCapIcon /> : <PriorityCenterIcon />}
      </div>
    </div>
  );
}

export function resolvePriorityOrbitalVariant(
  title: string | null | undefined,
): PriorityOrbitalProps["variant"] {
  if (!title) {
    return "default";
  }

  const normalized = title.toLowerCase();
  if (
    normalized.includes("study abroad") ||
    normalized.includes("graduation") ||
    normalized.includes("school") ||
    normalized.includes("university") ||
    normalized.includes("college")
  ) {
    return "education";
  }

  return "default";
}
