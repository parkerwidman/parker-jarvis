"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  computeJitteredLength,
  getRingColor,
  INNER_BARS,
  OUTER_BARS,
  RING_CENTER,
  RING_TICKS,
  type RitualMode,
} from "@/lib/jarvis/morning-ritual/ring-geometry";

import styles from "./morning-ritual.module.css";

type RitualRingProps = {
  recommendedMode: RitualMode | null;
  modeRevealed: boolean;
  isPlaying: boolean;
};

type BarLengths = {
  outer: number[];
  inner: number[];
};

function buildBaselineLengths(): BarLengths {
  return {
    outer: OUTER_BARS.map((bar) => bar.baselineLength),
    inner: INNER_BARS.map((bar) => bar.baselineLength),
  };
}

function computeBarEndpoint(
  center: number,
  innerRadius: number,
  angle: number,
  length: number,
): { x2: number; y2: number } {
  return {
    x2: center + (innerRadius + length) * Math.cos(angle),
    y2: center + (innerRadius + length) * Math.sin(angle),
  };
}

export function RitualRing({
  recommendedMode,
  modeRevealed,
  isPlaying,
}: RitualRingProps) {
  const ringColor = getRingColor(recommendedMode, modeRevealed);
  const baseline = useMemo(() => buildBaselineLengths(), []);
  const [barLengths, setBarLengths] = useState<BarLengths>(baseline);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setBarLengths(baseline);
      return;
    }

    const tick = () => {
      frameRef.current += 1;
      const frame = frameRef.current;

      setBarLengths({
        outer: OUTER_BARS.map((bar, index) =>
          computeJitteredLength(bar.baselineLength, index, frame, 6, 36),
        ),
        inner: INNER_BARS.map((bar, index) =>
          computeJitteredLength(bar.baselineLength, index + 100, frame, 3, 15),
        ),
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [baseline, isPlaying]);

  return (
    <div
      className={styles.ringWrapper}
      data-testid="ritual-ring-wrapper"
      style={{ ["--ring-color" as string]: ringColor }}
    >
      <svg
        className={styles.ringSvg}
        viewBox="0 0 300 300"
        data-testid="ritual-ring-svg"
        aria-hidden="true"
      >
        <defs>
          <filter id="ritual-large-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="ritual-inner-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={118}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={1}
          data-testid="ritual-boundary"
        />

        <g data-testid="ritual-ticks">
          {RING_TICKS.map((tick) => (
            <line
              key={tick.index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={
                tick.isMajor ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.16)"
              }
              strokeWidth={tick.isMajor ? 1.6 : 1}
              data-testid="ritual-tick"
              data-major={tick.isMajor ? "true" : "false"}
            />
          ))}
        </g>

        <circle
          className={styles.radarSweep}
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={100}
          fill="none"
          stroke="var(--ring-color)"
          strokeWidth={2}
          opacity={0.75}
          strokeDasharray="26 602"
          data-testid="ritual-radar-sweep"
        />

        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={88}
          fill="var(--ring-color)"
          opacity={0.1}
          filter="url(#ritual-large-glow)"
          data-testid="ritual-large-glow"
        />

        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={55}
          fill="var(--ring-color)"
          opacity={0.22}
          filter="url(#ritual-inner-glow)"
          data-testid="ritual-inner-glow"
        />

        <circle
          className={styles.ringCore}
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={42}
          fill="var(--ring-color)"
          opacity={0.92}
          data-testid="ritual-core"
        />

        <g className={styles.innerBarsGroup} data-testid="ritual-inner-bars">
          {INNER_BARS.map((bar, index) => {
            const length = barLengths.inner[index];
            const end = computeBarEndpoint(
              RING_CENTER,
              46,
              bar.angle,
              length,
            );

            return (
              <line
                key={bar.index}
                x1={bar.x1}
                y1={bar.y1}
                x2={end.x2}
                y2={end.y2}
                stroke="var(--ring-color)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.75}
                data-testid="ritual-inner-bar"
              />
            );
          })}
        </g>

        <g className={styles.outerBarsGroup} data-testid="ritual-outer-bars">
          {OUTER_BARS.map((bar, index) => {
            const length = barLengths.outer[index];
            const end = computeBarEndpoint(
              RING_CENTER,
              62,
              bar.angle,
              length,
            );

            return (
              <line
                key={bar.index}
                x1={bar.x1}
                y1={bar.y1}
                x2={end.x2}
                y2={end.y2}
                stroke="var(--ring-color)"
                strokeWidth={3}
                strokeLinecap="round"
                data-testid="ritual-outer-bar"
              />
            );
          })}
        </g>

        <g data-testid="ritual-orbit-dots">
          <g className={styles.orbitGroup1}>
            <circle
              cx={RING_CENTER}
              cy={42}
              r={2.6}
              fill="var(--ring-color)"
              data-testid="ritual-orbit-dot"
            />
          </g>
          <g className={styles.orbitGroup2}>
            <circle
              cx={RING_CENTER}
              cy={248}
              r={2.1}
              fill="var(--ring-color)"
              data-testid="ritual-orbit-dot"
            />
          </g>
          <g className={styles.orbitGroup3}>
            <circle
              cx={238}
              cy={RING_CENTER}
              r={1.8}
              fill="var(--ring-color)"
              data-testid="ritual-orbit-dot"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
