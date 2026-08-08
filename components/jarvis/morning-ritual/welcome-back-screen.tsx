"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { WELCOME_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

const WELCOME_BACK_FLASH_MS = 1900;

type WelcomeBackScreenProps = {
  displayName: string;
};

export function WelcomeBackScreen({ displayName }: WelcomeBackScreenProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/?ritualEntry=complete");
    }, WELCOME_BACK_FLASH_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [router]);

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
}: WelcomeBackScreenProps) {
  return (
    <>
      <RitualBackground stars={WELCOME_STARFIELD} showAurora3={false} />
      <WelcomeBackScreen displayName={displayName} />
    </>
  );
}
