const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "st",
  "vs",
  "etc",
  "eg",
  "ie",
]);

function isAbbreviation(word: string): boolean {
  return ABBREVIATIONS.has(word.toLowerCase());
}

function isDecimalPoint(text: string, index: number): boolean {
  if (text[index] !== ".") {
    return false;
  }

  const prev = index > 0 ? text[index - 1] : "";
  const next = index + 1 < text.length ? text[index + 1] : "";

  return /\d/.test(prev) && /\d/.test(next);
}

function startsNewSentence(text: string, boundaryIndex: number): boolean {
  const remainder = text.slice(boundaryIndex + 1);

  if (remainder.length === 0) {
    return true;
  }

  if (!/^\s/.test(remainder)) {
    return false;
  }

  const nextContent = remainder.trimStart();

  if (nextContent.length === 0) {
    return true;
  }

  return /^[A-Z0-9"'([]/.test(nextContent);
}

export function segmentMorningBriefSentences(content: string): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [];
  }

  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char !== "." && char !== "!" && char !== "?") {
      continue;
    }

    if (isDecimalPoint(normalized, index)) {
      continue;
    }

    if (char === ".") {
      const wordMatch = normalized.slice(start, index).match(/([A-Za-z]+)$/);
      if (wordMatch && isAbbreviation(wordMatch[1])) {
        continue;
      }
    }

    if (!startsNewSentence(normalized, index)) {
      continue;
    }

    const sentence = normalized.slice(start, index + 1).trim();

    if (sentence) {
      sentences.push(sentence);
    }

    start = index + 1;

    while (start < normalized.length && normalized[start] === " ") {
      start += 1;
    }

    index = start - 1;
  }

  const trailing = normalized.slice(start).trim();

  if (trailing) {
    sentences.push(trailing);
  }

  return sentences.filter((sentence) => sentence.length > 0);
}
