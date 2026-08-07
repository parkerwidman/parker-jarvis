import "server-only";

export const MORNING_BRIEF_AUDIO_BUCKET = "morning-brief-audio";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BRIEFING_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CONTENT_HASH_REGEX = /^[0-9a-f]{64}$/;

export function isValidBriefingDate(value: string): boolean {
  if (!BRIEFING_DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidUserId(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function isValidContentHash(value: string): boolean {
  return CONTENT_HASH_REGEX.test(value);
}

export function buildMorningBriefAudioStoragePath(
  userId: string,
  briefingDate: string,
  contentHash: string,
): string {
  if (!isValidUserId(userId)) {
    throw new Error("Invalid user id for audio storage path.");
  }

  if (!isValidBriefingDate(briefingDate)) {
    throw new Error("Invalid briefing date for audio storage path.");
  }

  if (!isValidContentHash(contentHash)) {
    throw new Error("Invalid content hash for audio storage path.");
  }

  return `${userId}/${briefingDate}/${contentHash}.mp3`;
}

export function isMorningBriefAudioStoragePath(
  storagePath: string,
  userId: string,
  briefingDate: string,
): boolean {
  if (!isValidUserId(userId) || !isValidBriefingDate(briefingDate)) {
    return false;
  }

  const prefix = `${userId}/${briefingDate}/`;

  if (!storagePath.startsWith(prefix) || !storagePath.endsWith(".mp3")) {
    return false;
  }

  const hashPart = storagePath.slice(prefix.length, -4);

  return isValidContentHash(hashPart);
}
