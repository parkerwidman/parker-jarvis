"use client";

import Link from "next/link";

import type { CommandCenterGoalProgress } from "@/lib/jarvis/dashboard/load-command-center";
import { useCommandCenterMode } from "./command-center-mode-provider";
import { itemMatchesMode } from "@/lib/jarvis/dashboard/command-center-mode";

type GoalProgressPanelProps = {
  goals: CommandCenterGoalProgress[];
};

function GoalGauge({ progress }: { progress: number }) {
  const clamped = Math.min(Math.max(progress, 0), 100);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="cc2-goal-gauge" aria-hidden="true">
      <svg viewBox="0 0 112 112" className="cc2-goal-gauge-svg">
        <defs>
          <linearGradient id="cc2-goal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5BB0FF" />
            <stop offset="55%" stopColor="#4DA3FF" />
            <stop offset="100%" stopColor="#B794FF" />
          </linearGradient>
          <linearGradient id="cc2-goal-gradient-track" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(77,163,255,0.42)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0.38)" />
          </linearGradient>
        </defs>
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="url(#cc2-goal-gradient-track)"
          strokeWidth="10"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="url(#cc2-goal-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 56 56)"
        />
      </svg>
      <span className="cc2-goal-gauge-value">{clamped}%</span>
    </div>
  );
}

export function GoalProgressPanel({ goals }: GoalProgressPanelProps) {
  const { mode } = useCommandCenterMode();

  const filtered = goals.filter((goal) =>
    itemMatchesMode(goal.lifeAreaName, mode),
  );
  const primaryGoal = filtered[0] ?? null;

  return (
    <section className="cc2-goals-panel-card" aria-label="Goal progress">
      <div className="cc2-goals-head">
        <span className="cc2-goals-title">Goal progress</span>
        {primaryGoal ? (
          <Link href="/goals/short-term" className="cc2-goals-link">
            View goal
          </Link>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="cc2-goals-empty">
          No active {mode === "melusi" ? "Melusi" : "personal"} goals yet.
        </p>
      ) : primaryGoal ? (
        <div className="cc2-goal-feature">
          <GoalGauge progress={primaryGoal.progress} />
          <div className="cc2-goal-feature-copy">
            <h3 className="cc2-goal-feature-title" title={primaryGoal.title}>
              {primaryGoal.title}
            </h3>
            <p className="cc2-goal-feature-meta">{primaryGoal.progressLabel}</p>
            <div className="cc2-goal-bar-track">
              <div
                className="cc2-goal-bar-fill"
                style={{ width: `${Math.min(primaryGoal.progress, 100)}%` }}
                role="progressbar"
                aria-valuenow={primaryGoal.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${primaryGoal.title} progress`}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
