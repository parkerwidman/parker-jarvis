import styles from "./morning-ritual.module.css";

type RitualTranscriptProps = {
  sentences: readonly string[];
  /** -1 before the first sentence startMs is reached. */
  activeSentenceIndex: number;
};

export function RitualTranscript({
  sentences,
  activeSentenceIndex,
}: RitualTranscriptProps) {
  return (
    <p className={styles.ritualTranscript} data-testid="ritual-transcript">
      {sentences.map((sentence, index) => (
        <span
          key={index}
          className={
            index === activeSentenceIndex
              ? styles.transcriptSentenceActive
              : styles.transcriptSentence
          }
          data-testid="ritual-transcript-sentence"
          data-active={index === activeSentenceIndex ? "true" : "false"}
        >
          {sentence}
          {index < sentences.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
