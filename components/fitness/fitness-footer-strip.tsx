type FitnessFooterStripProps = {
  displayName: string;
};

export function FitnessFooterStrip({ displayName }: FitnessFooterStripProps) {
  return (
    <footer className="fit-footer-strip" aria-label="Fitness encouragement">
      <span className="fit-footer-icon" aria-hidden="true">
        ✦
      </span>
      <p className="fit-footer-message">
        Consistency is built in recovery. Your body adapts when you rest as much
        as when you train.
      </p>
      <p className="fit-footer-aside">Keep it up, {displayName}.</p>
    </footer>
  );
}
