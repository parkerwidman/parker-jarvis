import { SLEEP_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

export function SleepScreen() {
  return (
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
      >
        Sign in
      </button>
    </div>
  );
}

export function SleepScreenWithBackground() {
  return (
    <>
      <RitualBackground stars={SLEEP_STARFIELD} showAurora3 />
      <SleepScreen />
    </>
  );
}
