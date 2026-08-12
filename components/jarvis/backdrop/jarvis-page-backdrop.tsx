import styles from "./jarvis-page-backdrop.module.css";

export type JarvisBackdropVariant =
  | "none"
  | "subtle"
  | "goals"
  | "melusi"
  | "fitness";

type JarvisPageBackdropProps = {
  variant?: JarvisBackdropVariant;
};

const VARIANT_CLASS: Record<
  Exclude<JarvisBackdropVariant, "none">,
  string
> = {
  subtle: styles.variantSubtle,
  goals: styles.variantGoals,
  melusi: styles.variantMelusi,
  fitness: styles.variantFitness,
};

export function JarvisPageBackdrop({ variant = "none" }: JarvisPageBackdropProps) {
  if (variant === "none") {
    return null;
  }

  const variantClass = VARIANT_CLASS[variant];

  return (
    <div
      className={`${styles.backdrop} ${variantClass}`}
      aria-hidden="true"
      data-backdrop-variant={variant}
    >
      {variant === "subtle" ? (
        <div className={`${styles.layer} ${styles.subtleAtmosphere}`} />
      ) : null}
      {variant === "goals" ? (
        <div className={`${styles.layer} ${styles.goalsAtmosphere}`} />
      ) : null}
      {variant === "melusi" ? (
        <div className={`${styles.layer} ${styles.melusiAtmosphere}`} />
      ) : null}
      {variant === "fitness" ? (
        <div className={`${styles.layer} ${styles.fitnessAtmosphere}`} />
      ) : null}
    </div>
  );
}
