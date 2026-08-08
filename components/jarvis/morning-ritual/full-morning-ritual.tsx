"use client";

import { useEffect, useState } from "react";

import {
  DEMO_RITUAL_TRANSCRIPT,
  formatRitualDate,
  getDemoRitualSnapshot,
} from "@/lib/jarvis/morning-ritual/demo-ritual-timeline";
import {
  getModeAccentBorder,
  getRingColor,
  type RitualMode,
} from "@/lib/jarvis/morning-ritual/ring-geometry";
import { SLEEP_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";

import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";
import { RitualRing } from "./ritual-ring";
import { RitualTranscript } from "./ritual-transcript";

export type FullMorningRitualProps = {
  displayName: string;
  ritualDate: string;
  transcript?: readonly string[];
  activeSentenceIndex?: number;
  recommendedMode?: RitualMode | null;
  modeRevealed?: boolean;
  isPlaying?: boolean;
  isFinished?: boolean;
  demoMode?: boolean;
};

export function FullMorningRitual({
  displayName,
  ritualDate,
  transcript = DEMO_RITUAL_TRANSCRIPT,
  activeSentenceIndex: activeSentenceIndexProp,
  recommendedMode: recommendedModeProp,
  modeRevealed: modeRevealedProp,
  isPlaying: isPlayingProp,
  isFinished: isFinishedProp,
  demoMode = false,
}: FullMorningRitualProps) {
  const [demoSnapshot, setDemoSnapshot] = useState(() =>
    demoMode ? getDemoRitualSnapshot(0) : null,
  );

  useEffect(() => {
    if (!demoMode) {
      return;
    }

    const startedAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      setDemoSnapshot(getDemoRitualSnapshot(now - startedAt));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [demoMode]);

  const activeSentenceIndex =
    demoMode && demoSnapshot
      ? demoSnapshot.activeSentenceIndex
      : (activeSentenceIndexProp ?? 0);
  const recommendedMode =
    demoMode && demoSnapshot
      ? demoSnapshot.recommendedMode
      : (recommendedModeProp ?? null);
  const modeRevealed =
    demoMode && demoSnapshot
      ? demoSnapshot.modeRevealed
      : (modeRevealedProp ?? false);
  const isPlaying =
    demoMode && demoSnapshot ? demoSnapshot.isPlaying : (isPlayingProp ?? false);
  const isFinished =
    demoMode && demoSnapshot ? demoSnapshot.isFinished : (isFinishedProp ?? false);

  const accentColor = getRingColor(recommendedMode, modeRevealed);
  const accentBorder = getModeAccentBorder(recommendedMode);

  return (
    <>
      <RitualBackground stars={SLEEP_STARFIELD} showAurora3 />
      <div className={styles.content} data-testid="full-morning-ritual">
        <h1
          className={styles.greeting}
          data-testid="ritual-greeting"
          style={{
            ["--accent" as string]: accentColor,
            ["--accent-border" as string]: accentBorder,
          }}
        >
          Good morning,{" "}
          <span className={styles.greetingName} data-testid="ritual-display-name">
            {displayName}
          </span>
        </h1>

        <div
          className={styles.greetingUnderline}
          style={{ ["--accent" as string]: accentColor }}
          data-testid="ritual-underline"
        />

        <p className={styles.ritualDate} data-testid="ritual-date">
          {formatRitualDate(ritualDate)}
        </p>

        <RitualRing
          recommendedMode={recommendedMode}
          modeRevealed={modeRevealed}
          isPlaying={isPlaying}
        />

        <RitualTranscript
          sentences={transcript}
          activeSentenceIndex={activeSentenceIndex}
        />

        <button
          type="button"
          className={
            isFinished ? styles.enterJarvisButtonVisible : styles.enterJarvisButton
          }
          data-testid="enter-jarvis-button"
          data-visible={isFinished ? "true" : "false"}
          style={{
            ["--accent" as string]: accentColor,
            ["--accent-border" as string]: accentBorder,
          }}
        >
          Enter Jarvis
        </button>
      </div>
    </>
  );
}

export function FullMorningRitualDemo(props: Omit<FullMorningRitualProps, "demoMode">) {
  return <FullMorningRitual {...props} demoMode />;
}
