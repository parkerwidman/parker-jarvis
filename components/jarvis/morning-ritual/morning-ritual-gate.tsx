import type { MorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";
import styles from "./morning-ritual.module.css";
import { SleepScreenWithBackground } from "./sleep-screen";
import { WelcomeBackScreenWithBackground } from "./welcome-back-screen";

type MorningRitualGateProps = {
  entry: MorningRitualEntry;
};

export function MorningRitualGate({ entry }: MorningRitualGateProps) {
  return (
    <main
      className={styles.ritualRoot}
      data-testid="morning-ritual-gate"
      data-ritual-state={entry.ritualState}
      data-ritual-status={entry.ritualStatus}
    >
      {entry.ritualState === "welcome_back" ? (
        <WelcomeBackScreenWithBackground displayName={entry.displayName} />
      ) : (
        <SleepScreenWithBackground />
      )}
    </main>
  );
}
