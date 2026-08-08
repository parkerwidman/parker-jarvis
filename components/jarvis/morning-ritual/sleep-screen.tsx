"use client";

import { useState } from "react";

import { SLEEP_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";

import { FullMorningRitualDemo } from "./full-morning-ritual";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

type SleepScreenProps = {
  displayName: string;
  ritualDate: string;
};

export function SleepScreen({ displayName, ritualDate }: SleepScreenProps) {
  const [showRitual, setShowRitual] = useState(false);

  if (showRitual) {
    return (
      <FullMorningRitualDemo displayName={displayName} ritualDate={ritualDate} />
    );
  }

  return (
    <>
      <RitualBackground stars={SLEEP_STARFIELD} showAurora3 />
      <div className={styles.content} data-testid="sleep-screen">
        <div className={styles.logoMark} data-testid="sleep-logo">
          <span className={styles.logoCore} />
          <span className={styles.logoPing} />
        </div>
        <h1 className={styles.sleepTitle}>JARVIS</h1>
        <p className={styles.sleepSubtitle}>Sleeping</p>
        <button
          type="button"
          className={styles.signInButton}
          data-testid="sign-in-button"
          onClick={() => setShowRitual(true)}
        >
          Sign in
        </button>
      </div>
    </>
  );
}

export function SleepScreenWithBackground(props: SleepScreenProps) {
  return <SleepScreen {...props} />;
}
