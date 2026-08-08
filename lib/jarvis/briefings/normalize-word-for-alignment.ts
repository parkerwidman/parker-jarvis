const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

const DIGIT_TO_NUMBER_WORD: Record<string, string> = Object.fromEntries(
  Object.entries(NUMBER_WORD_TO_DIGIT).map(([word, digit]) => [digit, word]),
);

export function normalizeApostrophes(value: string): string {
  return value.replace(/[''`]/g, "'");
}

export function stripAlignmentPunctuation(value: string): string {
  return value.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");
}

export function normalizeWordForAlignment(word: string): string {
  let normalized = normalizeApostrophes(word.toLowerCase());
  normalized = stripAlignmentPunctuation(normalized);

  if (NUMBER_WORD_TO_DIGIT[normalized]) {
    return NUMBER_WORD_TO_DIGIT[normalized];
  }

  return normalized;
}

export function canonicalizeAlignmentToken(word: string): string {
  const normalized = normalizeWordForAlignment(word);

  if (/^\d+$/.test(normalized) && DIGIT_TO_NUMBER_WORD[normalized]) {
    return DIGIT_TO_NUMBER_WORD[normalized];
  }

  return normalized;
}

export function alignmentTokensMatch(
  knownWord: string,
  transcribedWord: string,
): boolean {
  const knownCanonical = canonicalizeAlignmentToken(knownWord);
  const transcribedCanonical = canonicalizeAlignmentToken(transcribedWord);

  if (!knownCanonical || !transcribedCanonical) {
    return false;
  }

  if (knownCanonical === transcribedCanonical) {
    return true;
  }

  if (
    knownCanonical.length > 3 &&
    transcribedCanonical.length > 3 &&
    levenshteinDistance(knownCanonical, transcribedCanonical) <= 1
  ) {
    return true;
  }

  return false;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

export function tokenizeSentenceWords(sentence: string): string[] {
  return sentence.split(/\s+/).filter((word) => word.length > 0);
}
