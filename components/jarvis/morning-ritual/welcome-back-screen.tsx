"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { setMorningRitualBypassCookieInBrowser } from "@/lib/jarvis/rituals/set-morning-ritual-bypass-cookie";
import { WELCOME_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

const WELCOME_BACK_FLASH_MS = 1900;

type WelcomeBackScreenProps = {
  displayName: string;
  ritualDate: string;
};

export function WelcomeBackScreen({
  displayName,
  ritualDate,
}: WelcomeBackScreenProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setMorningRitualBypassCookieInBrowser(ritualDate);
      router.replace("/?ritualEntry=complete");
    }, WELCOME_BACK_FLASH_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [router, ritualDate]);

  return (
    <div className={styles.content} data-testid="welcome-back-screen">
      <p className={styles.welcomeText} data-testid="welcome-back-text">
        Welcome back,{" "}
        <span className={styles.displayName} data-testid="welcome-back-name">
          {displayName}
        </span>
      </p>
    </div>
  );
}

export function WelcomeBackScreenWithBackground({
  displayName,
  ritualDate,
}: WelcomeBackScreenProps) {
  return (
    <>
      <RitualBackground stars={WELCOME_STARFIELD} showAurora3={false} />
      <WelcomeBackScreen displayName={displayName} ritualDate={ritualDate} />
    </>
  );
}
