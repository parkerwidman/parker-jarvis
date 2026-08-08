import "server-only";

export const MORNING_BRIEF_AUDIO_BUCKET = "morning-brief-audio";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BRIEFING_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CONTENT_HASH_REGEX = /^[0-9a-f]{64}$/;

const CANONICAL_STORAGE_PATH_REGEX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(\d{4}-\d{2}-\d{2})\/([0-9a-f]{64})\.mp3$/i;

export type MorningBriefAudioStoragePathParts = {
  userId: string;
  briefingDate: string;
  contentHash: string;
};

export type ReadyMorningBriefAudioMetadataValidationFailure =
  | "path_missing"
  | "content_hash_invalid"
  | "path_shape_invalid"
  | "path_owner_mismatch"
  | "path_date_mismatch"
  | "path_hash_mismatch";

export function normalizeMorningBriefUserId(userId: string): string {
  return userId.toLowerCase();
}

export function normalizeMorningBriefContentHash(contentHash: string): string {
  return contentHash.toLowerCase();
}

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

export function parseMorningBriefAudioStoragePath(
  storagePath: string,
): MorningBriefAudioStoragePathParts | null {
  const trimmed = storagePath.trim();
  const match = CANONICAL_STORAGE_PATH_REGEX.exec(trimmed);

  if (!match) {
    return null;
  }

  const userId = normalizeMorningBriefUserId(match[1]);
  const briefingDate = match[2];
  const contentHash = normalizeMorningBriefContentHash(match[3]);

  if (
    !isValidUserId(userId) ||
    !isValidBriefingDate(briefingDate) ||
    !isValidContentHash(contentHash)
  ) {
    return null;
  }

  return { userId, briefingDate, contentHash };
}

export function buildMorningBriefAudioStoragePath(
  userId: string,
  briefingDate: string,
  contentHash: string,
): string {
  const normalizedUserId = normalizeMorningBriefUserId(userId);
  const normalizedContentHash = normalizeMorningBriefContentHash(contentHash);

  if (!isValidUserId(normalizedUserId)) {
    throw new Error("Invalid user id for audio storage path.");
  }

  if (!isValidBriefingDate(briefingDate)) {
    throw new Error("Invalid briefing date for audio storage path.");
  }

  if (!isValidContentHash(normalizedContentHash)) {
    throw new Error("Invalid content hash for audio storage path.");
  }

  return `${normalizedUserId}/${briefingDate}/${normalizedContentHash}.mp3`;
}

export function validateReadyMorningBriefAudioMetadata(input: {
  storagePath: string | null | undefined;
  contentHash: string | null | undefined;
  userId: string;
  briefingDate: string;
}):
  | { ok: true; storagePath: string }
  | {
      ok: false;
      reason: ReadyMorningBriefAudioMetadataValidationFailure;
    } {
  if (!input.storagePath?.trim()) {
    return { ok: false, reason: "path_missing" };
  }

  const normalizedContentHash = input.contentHash
    ? normalizeMorningBriefContentHash(input.contentHash)
    : null;

  if (!normalizedContentHash || !isValidContentHash(normalizedContentHash)) {
    return { ok: false, reason: "content_hash_invalid" };
  }

  if (!isValidUserId(input.userId) || !isValidBriefingDate(input.briefingDate)) {
    return { ok: false, reason: "path_shape_invalid" };
  }

  const trimmedPath = input.storagePath.trim();

  if (
    trimmedPath.startsWith("/") ||
    trimmedPath.startsWith(`${MORNING_BRIEF_AUDIO_BUCKET}/`)
  ) {
    return { ok: false, reason: "path_shape_invalid" };
  }

  const parsed = parseMorningBriefAudioStoragePath(trimmedPath);

  if (!parsed) {
    return { ok: false, reason: "path_shape_invalid" };
  }

  const expectedUserId = normalizeMorningBriefUserId(input.userId);

  if (parsed.userId !== expectedUserId) {
    return { ok: false, reason: "path_owner_mismatch" };
  }

  if (parsed.briefingDate !== input.briefingDate) {
    return { ok: false, reason: "path_date_mismatch" };
  }

  if (parsed.contentHash !== normalizedContentHash) {
    return { ok: false, reason: "path_hash_mismatch" };
  }

  return { ok: true, storagePath: trimmedPath };
}

export function isReadyMorningBriefAudioMetadataValid(
  row: {
    audio_content_hash: string | null;
    audio_storage_path: string | null;
  },
  userId: string,
  briefingDate: string,
): boolean {
  return validateReadyMorningBriefAudioMetadata({
    storagePath: row.audio_storage_path,
    contentHash: row.audio_content_hash,
    userId,
    briefingDate,
  }).ok;
}

export function isMorningBriefAudioStoragePath(
  storagePath: string,
  userId: string,
  briefingDate: string,
): boolean {
  if (!isValidUserId(userId) || !isValidBriefingDate(briefingDate)) {
    return false;
  }

  const parsed = parseMorningBriefAudioStoragePath(storagePath);

  if (!parsed) {
    return false;
  }

  return (
    parsed.userId === normalizeMorningBriefUserId(userId) &&
    parsed.briefingDate === briefingDate
  );
}
