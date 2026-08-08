import { describe, expect, it } from "vitest";

import {
  buildMorningBriefAudioStoragePath,
  isMorningBriefAudioStoragePath,
  isReadyMorningBriefAudioMetadataValid,
  validateReadyMorningBriefAudioMetadata,
} from "@/lib/jarvis/audio/storage-path";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRIEFING_DATE = "2026-08-07";
const OTHER_BRIEFING_DATE = "2026-08-06";
const CONTENT_HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_HASH =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

function canonicalPath(
  userId = USER_ID,
  briefingDate = BRIEFING_DATE,
  contentHash = CONTENT_HASH,
) {
  return buildMorningBriefAudioStoragePath(userId, briefingDate, contentHash);
}

describe("buildMorningBriefAudioStoragePath", () => {
  it("builds a canonical lowercase path", () => {
    expect(
      buildMorningBriefAudioStoragePath(
        USER_ID.toUpperCase(),
        BRIEFING_DATE,
        CONTENT_HASH.toUpperCase(),
      ),
    ).toBe(`${USER_ID}/${BRIEFING_DATE}/${CONTENT_HASH}.mp3`);
  });
});

describe("validateReadyMorningBriefAudioMetadata", () => {
  it("accepts a path built by buildMorningBriefAudioStoragePath", () => {
    const storagePath = canonicalPath();

    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath,
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({
      ok: true,
      storagePath,
    });
  });

  it("accepts the same canonical path used by the audio route validator", () => {
    const storagePath = canonicalPath();
    const row = {
      audio_content_hash: CONTENT_HASH,
      audio_storage_path: storagePath,
    };

    expect(
      isReadyMorningBriefAudioMetadataValid(row, USER_ID, BRIEFING_DATE),
    ).toBe(true);
    expect(
      isMorningBriefAudioStoragePath(storagePath, USER_ID, BRIEFING_DATE),
    ).toBe(true);
  });

  it("rejects a leading-slash malformed path", () => {
    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath: `/${canonicalPath()}`,
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({ ok: false, reason: "path_shape_invalid" });
  });

  it("rejects a bucket-prefixed malformed path", () => {
    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath: `morning-brief-audio/${canonicalPath()}`,
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({ ok: false, reason: "path_shape_invalid" });
  });

  it("rejects a wrong user", () => {
    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath: canonicalPath(OTHER_USER_ID),
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({ ok: false, reason: "path_owner_mismatch" });
  });

  it("rejects a wrong briefing date", () => {
    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath: canonicalPath(USER_ID, OTHER_BRIEFING_DATE),
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({ ok: false, reason: "path_date_mismatch" });
  });

  it("rejects a wrong hash", () => {
    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath: canonicalPath(USER_ID, BRIEFING_DATE, OTHER_HASH),
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({ ok: false, reason: "path_hash_mismatch" });
  });

  it("accepts stored path casing when segments match canonically", () => {
    const storagePath = `${USER_ID.toUpperCase()}/${BRIEFING_DATE}/${CONTENT_HASH.toUpperCase()}.mp3`;

    expect(
      validateReadyMorningBriefAudioMetadata({
        storagePath,
        contentHash: CONTENT_HASH,
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
      }),
    ).toEqual({
      ok: true,
      storagePath,
    });
  });
});

describe("isMorningBriefAudioStoragePath", () => {
  it("matches canonical builder output case-insensitively for UUID segments", () => {
    const storagePath = `${USER_ID.toUpperCase()}/${BRIEFING_DATE}/${CONTENT_HASH}.mp3`;

    expect(
      isMorningBriefAudioStoragePath(storagePath, USER_ID, BRIEFING_DATE),
    ).toBe(true);
  });
});
