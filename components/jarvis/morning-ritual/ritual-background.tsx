import type { RitualStar } from "@/lib/jarvis/morning-ritual/starfield";
import styles from "./morning-ritual.module.css";

type RitualBackgroundProps = {
  stars: RitualStar[];
  showAurora3?: boolean;
};

export function RitualBackground({
  stars,
  showAurora3 = true,
}: RitualBackgroundProps) {
  return (
    <div className={styles.background} data-testid="ritual-background">
      <div className={`${styles.aurora} ${styles.aurora1}`} data-testid="ritual-aurora-1" />
      <div className={`${styles.aurora} ${styles.aurora2}`} data-testid="ritual-aurora-2" />
      {showAurora3 ? (
        <div
          className={`${styles.aurora} ${styles.aurora3}`}
          data-testid="ritual-aurora-3"
        />
      ) : null}
      <div className={styles.grid} data-testid="ritual-grid" />
      <div className={styles.starfield} data-testid="ritual-starfield">
        {stars.map((star) => (
          <span
            key={star.id}
            className={styles.star}
            data-testid="ritual-star"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              ["--star-delay" as string]: `${star.delay}s`,
              ["--star-duration" as string]: `${star.duration}s`,
            }}
          />
        ))}
      </div>
      <div className={styles.vignette} data-testid="ritual-vignette" />
    </div>
  );
}
