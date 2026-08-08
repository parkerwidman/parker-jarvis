import { WELCOME_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

type WelcomeBackScreenProps = {
  displayName: string;
};

export function WelcomeBackScreen({ displayName }: WelcomeBackScreenProps) {
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
