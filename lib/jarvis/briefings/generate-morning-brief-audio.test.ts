import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import {
  DEFAULT_TTS_FORMAT,
  MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  resolveMorningBriefTtsConfig,
} from "@/lib/jarvis/audio/tts-config";
import {
  generateMorningBriefAudio,
  MORNING_BRIEF_AUDIO_ERROR_CODES,
  MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
  timestampsRepresentSameInstant,
} from "@/lib/jarvis/briefings/generate-morning-brief-audio";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRIEFING_DATE = "2026-08-07";
const SPOKEN_TEXT =
  "Good morning, Parker. Your top priority is finishing the proposal.";
const WORKER_A_CLAIM_AT = new Date("2026-08-07T12:00:00.000Z");
const WORKER_B_RECLAIM_AT = new Date(
  WORKER_A_CLAIM_AT.getTime() + MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
);

const mockCreateSpeech = vi.fn();
const mockUpload = vi.fn();
const mockRemove = vi.fn();

function expectedContentHash(text = SPOKEN_TEXT) {
  const config = resolveMorningBriefTtsConfig();
  return computeTtsContentHash({
    text,
    model: config.model,
    voice: config.voice,
    format: DEFAULT_TTS_FORMAT,
    instructionVersion: MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  });
}

type BriefingRow = {
  content: string;
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
  audio_generation_started_at: string | null;
  audio_error_code?: string | null;
};

type UpdateFilters = Record<string, unknown>;

function toPostgresTimestamptz(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }

  return new Date(parsed).toISOString().replace("Z", "+00:00");
}

function canClaimInitial(row: BriefingRow, contentHash: string): boolean {
  if (row.content !== SPOKEN_TEXT) {
    return false;
  }

  if (["none", "pending", "failed"].includes(row.audio_status)) {
    return true;
  }

  if (row.audio_status === "ready" && row.audio_content_hash !== contentHash) {
    return true;
  }

  if (
    row.audio_status === "generating" &&
    row.audio_content_hash !== contentHash
  ) {
    return true;
  }

  return false;
}

function canReclaimStale(
  row: BriefingRow,
  contentHash: string,
  staleBeforeIso: string,
): boolean {
  return (
    row.content === SPOKEN_TEXT &&
    row.audio_status === "generating" &&
    row.audio_content_hash === contentHash &&
    !!row.audio_generation_started_at &&
    row.audio_generation_started_at <= staleBeforeIso
  );
}

function matchesClaimOwnership(
  row: BriefingRow,
  contentHash: string,
  filters: UpdateFilters,
): boolean {
  return (
    row.content === SPOKEN_TEXT &&
    row.audio_status === "generating" &&
    row.audio_content_hash === contentHash &&
    timestampsRepresentSameInstant(
      filters.audio_generation_started_at as string | null | undefined,
      row.audio_generation_started_at,
    )
  );
}

function persistClaimStartedAt(payload: Record<string, unknown>): string {
  return toPostgresTimestamptz(payload.audio_generation_started_at as string);
}

function createMockAutomationClient(initialRow: BriefingRow | null) {
  let row: BriefingRow | null = initialRow ? { ...initialRow } : null;
  const updates: Array<Record<string, unknown>> = [];
  const uploadCalls: Array<{
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }> = [];
  const removeCalls: string[][] = [];
  let claimCount = 0;

  mockUpload.mockImplementation(
    (path: string, bytes: Uint8Array, options: { contentType: string }) => {
      uploadCalls.push({ path, bytes, contentType: options.contentType });
      return Promise.resolve({ error: null });
    },
  );

  mockRemove.mockImplementation((paths: string[]) => {
    removeCalls.push(paths);
    return Promise.resolve({ error: null });
  });

  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: row,
              error: null,
            })),
          })),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);

        const filters: UpdateFilters = {};
        const chain = {
          eq: vi.fn(function eqColumn(column: string, value: unknown) {
            filters[column] = value;
            return chain;
          }),
          or: vi.fn(function orFilter() {
            return chain;
          }),
          lte: vi.fn(function lteFilter() {
            return chain;
          }),
          select: vi.fn(function selectColumns() {
            return {
              maybeSingle: vi.fn(async () => {
                const contentHash = expectedContentHash();
                const staleBeforeIso = new Date(
                  WORKER_B_RECLAIM_AT.getTime() -
                    MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
                ).toISOString();

                if (payload.audio_status === "generating" && row) {
                  if (canClaimInitial(row, contentHash)) {
                    const persistedClaimStartedAt = persistClaimStartedAt(payload);
                    row = {
                      ...row,
                      audio_status: "generating",
                      audio_content_hash: contentHash,
                      audio_generation_started_at: persistedClaimStartedAt,
                      audio_error_code: null,
                    };
                    claimCount += 1;
                    return {
                      data: {
                        id: "brief-1",
                        audio_generation_started_at: persistedClaimStartedAt,
                      },
                      error: null,
                    };
                  }

                  if (
                    canReclaimStale(row, contentHash, staleBeforeIso) &&
                    claimCount === 0
                  ) {
                    const persistedClaimStartedAt = persistClaimStartedAt(payload);
                    row = {
                      ...row,
                      audio_status: "generating",
                      audio_content_hash: contentHash,
                      audio_generation_started_at: persistedClaimStartedAt,
                      audio_error_code: null,
                    };
                    claimCount += 1;
                    return {
                      data: {
                        id: "brief-1",
                        audio_generation_started_at: persistedClaimStartedAt,
                      },
                      error: null,
                    };
                  }

                  return { data: null, error: null };
                }

                if (payload.audio_status === "ready" && row) {
                  if (matchesClaimOwnership(row, contentHash, filters)) {
                    row = {
                      ...row,
                      audio_status: "ready",
                      audio_content_hash: contentHash,
                      audio_storage_path: `${USER_ID}/${BRIEFING_DATE}/${contentHash}.mp3`,
                      audio_generation_started_at: null,
                    };
                    return {
                      data: { audio_storage_path: row.audio_storage_path },
                      error: null,
                    };
                  }

                  return { data: null, error: null };
                }

                if (payload.audio_status === "failed" && row) {
                  if (matchesClaimOwnership(row, contentHash, filters)) {
                    row = {
                      ...row,
                      audio_status: "failed",
                      audio_error_code: payload.audio_error_code as string,
                      audio_content_hash: contentHash,
                      audio_generation_started_at: null,
                    };
                    return { data: { id: "brief-1" }, error: null };
                  }

                  return { data: null, error: null };
                }

                return { data: null, error: null };
              }),
            };
          }),
        };

        return chain;
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
      })),
    },
  } as unknown as SupabaseClient;

  return {
    supabase,
    updates,
    uploadCalls,
    removeCalls,
    getRow: () => row,
    setRow: (nextRow: BriefingRow | null) => {
      row = nextRow ? { ...nextRow } : null;
    },
    resetClaimCount: () => {
      claimCount = 0;
    },
  };
}

describe("timestampsRepresentSameInstant", () => {
  it("treats equivalent Z and +00:00 timestamps as the same instant", () => {
    expect(
      timestampsRepresentSameInstant(
        "2026-08-07T08:23:15.123Z",
        "2026-08-07T08:23:15.123+00:00",
      ),
    ).toBe(true);
  });

  it("returns false for null or invalid timestamps", () => {
    expect(timestampsRepresentSameInstant(null, "2026-08-07T08:23:15.123Z")).toBe(
      false,
    );
    expect(timestampsRepresentSameInstant("not-a-date", "2026-08-07T08:23:15.123Z")).toBe(
      false,
    );
  });

  it("returns false for genuinely different timestamps", () => {
    expect(
      timestampsRepresentSameInstant(
        "2026-08-07T08:23:15.123Z",
        "2026-08-07T08:23:16.123Z",
      ),
    ).toBe(false);
  });
});

describe("generateMorningBriefAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.JARVIS_TTS_MODEL;
    delete process.env.JARVIS_TTS_VOICE;
    mockCreateSpeech.mockResolvedValue({
      success: true,
      audioBytes: new Uint8Array([1, 2, 3, 4]),
    });
  });

  it("skips OpenAI and upload when ready audio already matches the current hash", async () => {
    const hash = expectedContentHash();
    const { supabase } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "ready",
      audio_content_hash: hash,
      audio_storage_path: `${USER_ID}/${BRIEFING_DATE}/${hash}.mp3`,
      audio_generation_started_at: null,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_B_RECLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("already_ready");
    expect(mockCreateSpeech).not.toHaveBeenCalled();
  });

  it("uses the database-returned claim timestamp as authoritative on initial claim", async () => {
    const { supabase, updates } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("ready");
    expect(
      updates.some(
        (update) =>
          update.audio_status === "ready" &&
          update.audio_generation_started_at === null,
      ),
    ).toBe(true);
  });

  it("uses the database-returned claim timestamp as authoritative on stale reclaim", async () => {
    const hash = expectedContentHash();
    const staleStartedAt = new Date(
      WORKER_B_RECLAIM_AT.getTime() - MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
    ).toISOString();
    const { supabase } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "generating",
      audio_content_hash: hash,
      audio_storage_path: null,
      audio_generation_started_at: staleStartedAt,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_B_RECLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("ready");
  });

  it("recognizes ownership after TTS when Supabase reload returns +00:00 for a Z claim", async () => {
    const hash = expectedContentHash();
    const jsClaimAt = "2026-08-07T08:23:15.123Z";
    const postgresClaimAt = "2026-08-07T08:23:15.123+00:00";
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    mockCreateSpeech.mockImplementationOnce(async () => {
      mock.setRow({
        content: SPOKEN_TEXT,
        audio_status: "generating",
        audio_content_hash: hash,
        audio_storage_path: null,
        audio_generation_started_at: postgresClaimAt,
      });
      return {
        success: true,
        audioBytes: new Uint8Array([7, 8, 9]),
      };
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => new Date(jsClaimAt),
      },
    );

    expect(result.resultCode).toBe("ready");
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it("records audio_generation_started_at on initial claim using a single now value", async () => {
    const nowSpy = vi.fn(() => WORKER_A_CLAIM_AT);
    const { supabase, updates } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: nowSpy,
      },
    );

    expect(nowSpy).toHaveBeenCalledOnce();
    expect(
      updates.some(
        (update) =>
          update.audio_status === "generating" &&
          update.audio_generation_started_at === WORKER_A_CLAIM_AT.toISOString(),
      ),
    ).toBe(true);
    expect(
      updates.some(
        (update) =>
          update.audio_status === "ready" &&
          update.audio_generation_started_at === null &&
          update.audio_content_hash === expectedContentHash(),
      ),
    ).toBe(true);
  });

  it("returns generation_in_progress for an active same-hash claim younger than 10 minutes", async () => {
    const hash = expectedContentHash();
    const recentStartedAt = new Date(
      WORKER_B_RECLAIM_AT.getTime() - 5 * 60 * 1000,
    ).toISOString();
    const { supabase } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "generating",
      audio_content_hash: hash,
      audio_storage_path: null,
      audio_generation_started_at: recentStartedAt,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_B_RECLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("generation_in_progress");
    expect(mockCreateSpeech).not.toHaveBeenCalled();
  });

  it("reclaims and regenerates a stale same-hash claim at the 10-minute threshold", async () => {
    const hash = expectedContentHash();
    const staleStartedAt = new Date(
      WORKER_B_RECLAIM_AT.getTime() - MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
    ).toISOString();
    const { supabase, updates } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "generating",
      audio_content_hash: hash,
      audio_storage_path: null,
      audio_generation_started_at: staleStartedAt,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_B_RECLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("ready");
    expect(mockCreateSpeech).toHaveBeenCalledOnce();
    expect(
      updates.some(
        (update) =>
          update.audio_status === "generating" &&
          update.audio_generation_started_at === WORKER_B_RECLAIM_AT.toISOString(),
      ),
    ).toBe(true);
  });

  it("allows only one stale reclaim winner when two workers race", async () => {
    const hash = expectedContentHash();
    const staleStartedAt = new Date(
      WORKER_B_RECLAIM_AT.getTime() - MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
    ).toISOString();
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "generating",
      audio_content_hash: hash,
      audio_storage_path: null,
      audio_generation_started_at: staleStartedAt,
    });

    const [first, second] = await Promise.all([
      generateMorningBriefAudio(
        {
          userId: USER_ID,
          briefingDate: BRIEFING_DATE,
          normalizedSpokenContent: SPOKEN_TEXT,
        },
        {
          automationClient: mock.supabase,
          createSpeech: mockCreateSpeech,
          now: () => WORKER_B_RECLAIM_AT,
        },
      ),
      generateMorningBriefAudio(
        {
          userId: USER_ID,
          briefingDate: BRIEFING_DATE,
          normalizedSpokenContent: SPOKEN_TEXT,
        },
        {
          automationClient: mock.supabase,
          createSpeech: mockCreateSpeech,
          now: () => WORKER_B_RECLAIM_AT,
        },
      ),
    ]);

    const outcomes = [first.resultCode, second.resultCode].sort();
    expect(outcomes).toEqual(["generation_in_progress", "ready"]);
    expect(mockCreateSpeech).toHaveBeenCalledOnce();
  });

  it("prevents a stale worker from marking ready, failing, or deleting after reclaim", async () => {
    const hash = expectedContentHash();
    const storagePath = `${USER_ID}/${BRIEFING_DATE}/${hash}.mp3`;
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    mockCreateSpeech.mockImplementationOnce(async () => {
      mock.setRow({
        content: SPOKEN_TEXT,
        audio_status: "generating",
        audio_content_hash: hash,
        audio_storage_path: null,
        audio_generation_started_at: WORKER_B_RECLAIM_AT.toISOString(),
      });
      return {
        success: true,
        audioBytes: new Uint8Array([1, 2, 3]),
      };
    });

    const workerAResult = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(workerAResult.resultCode).toBe("generation_in_progress");
    expect(mock.getRow()?.audio_status).toBe("generating");
    expect(mock.getRow()?.audio_generation_started_at).toBe(
      WORKER_B_RECLAIM_AT.toISOString(),
    );
    expect(mock.getRow()?.audio_status).not.toBe("ready");
    expect(mock.getRow()?.audio_status).not.toBe("failed");
    expect(mock.removeCalls.flat()).not.toContain(storagePath);
    expect(
      mock.updates.some(
        (update) =>
          update.audio_status === "failed" &&
          update.audio_generation_started_at === null,
      ),
    ).toBe(false);
  });

  it("lets the reclaiming worker complete with its exact claimStartedAt", async () => {
    const hash = expectedContentHash();
    const staleStartedAt = WORKER_A_CLAIM_AT.toISOString();
    const { supabase, updates } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "generating",
      audio_content_hash: hash,
      audio_storage_path: null,
      audio_generation_started_at: staleStartedAt,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_B_RECLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("ready");
    expect(
      updates.some(
        (update) =>
          update.audio_status === "ready" &&
          update.audio_generation_started_at === null,
      ),
    ).toBe(true);
    expect(mockCreateSpeech).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it("includes exact claimStartedAt in persistAudioFailure updates", async () => {
    mockCreateSpeech.mockResolvedValueOnce({
      success: false,
      errorCode: MORNING_BRIEF_AUDIO_ERROR_CODES.ttsFailed,
    });

    const { supabase, updates } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(
      updates.some(
        (update) =>
          update.audio_status === "generating" &&
          update.audio_generation_started_at === WORKER_A_CLAIM_AT.toISOString(),
      ),
    ).toBe(true);
    expect(
      updates.some(
        (update) =>
          update.audio_status === "failed" &&
          update.audio_generation_started_at === null,
      ),
    ).toBe(true);
  });

  it("prevents upload when ownership is lost after TTS returns", async () => {
    const hash = expectedContentHash();
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    mockCreateSpeech.mockImplementationOnce(async () => {
      mock.setRow({
        content: SPOKEN_TEXT,
        audio_status: "generating",
        audio_content_hash: hash,
        audio_storage_path: null,
        audio_generation_started_at: WORKER_B_RECLAIM_AT.toISOString(),
      });
      return {
        success: true,
        audioBytes: new Uint8Array([5, 5, 5]),
      };
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("generation_in_progress");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does not delete the same-hash storage path when post-upload ownership is lost", async () => {
    const hash = expectedContentHash();
    const storagePath = `${USER_ID}/${BRIEFING_DATE}/${hash}.mp3`;
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    const originalUpload = mockUpload.getMockImplementation();
    mockUpload.mockImplementationOnce(
      (path: string, bytes: Uint8Array, options: { contentType: string }) => {
        mock.setRow({
          content: SPOKEN_TEXT,
          audio_status: "generating",
          audio_content_hash: hash,
          audio_storage_path: null,
          audio_generation_started_at: WORKER_B_RECLAIM_AT.toISOString(),
        });
        return originalUpload?.(path, bytes, options) ?? Promise.resolve({ error: null });
      },
    );

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("generation_in_progress");
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mock.removeCalls.flat()).not.toContain(storagePath);
  });

  it("returns already_ready without deleting when another worker finalized the same hash", async () => {
    const hash = expectedContentHash();
    const storagePath = `${USER_ID}/${BRIEFING_DATE}/${hash}.mp3`;
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    const originalUpload = mockUpload.getMockImplementation();
    mockUpload.mockImplementationOnce(
      (path: string, bytes: Uint8Array, options: { contentType: string }) => {
        mock.setRow({
          content: SPOKEN_TEXT,
          audio_status: "ready",
          audio_content_hash: hash,
          audio_storage_path: storagePath,
          audio_generation_started_at: null,
        });
        return originalUpload?.(path, bytes, options) ?? Promise.resolve({ error: null });
      },
    );

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe("already_ready");
    expect(mock.removeCalls.flat()).not.toContain(storagePath);
  });

  it("does not throw when storage cleanup remove throws", async () => {
    mockRemove.mockRejectedValueOnce(new Error("remove exploded"));
    const oldHash = "b".repeat(64);
    const oldPath = `${USER_ID}/${BRIEFING_DATE}/${oldHash}.mp3`;
    const { supabase } = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "failed",
      audio_content_hash: oldHash,
      audio_storage_path: oldPath,
      audio_generation_started_at: null,
    });

    await expect(
      generateMorningBriefAudio(
        {
          userId: USER_ID,
          briefingDate: BRIEFING_DATE,
          normalizedSpokenContent: SPOKEN_TEXT,
        },
        {
          automationClient: supabase,
          createSpeech: mockCreateSpeech,
          now: () => WORKER_A_CLAIM_AT,
        },
      ),
    ).resolves.toMatchObject({ resultCode: "ready" });
  });

  it("rejects generation when the stored row content does not match", async () => {
    const { supabase } = createMockAutomationClient({
      content: "Different stored brief text.",
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe(
      MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
    );
  });

  it("does not mark stale audio ready when text changes during TTS", async () => {
    const mock = createMockAutomationClient({
      content: SPOKEN_TEXT,
      audio_status: "none",
      audio_content_hash: null,
      audio_storage_path: null,
      audio_generation_started_at: null,
    });

    mockCreateSpeech.mockImplementationOnce(async () => {
      mock.setRow({
        content: "Updated brief text after TTS started.",
        audio_status: "generating",
        audio_content_hash: expectedContentHash(),
        audio_storage_path: null,
        audio_generation_started_at: WORKER_A_CLAIM_AT.toISOString(),
      });
      return {
        success: true,
        audioBytes: new Uint8Array([9, 9, 9]),
      };
    });

    const result = await generateMorningBriefAudio(
      {
        userId: USER_ID,
        briefingDate: BRIEFING_DATE,
        normalizedSpokenContent: SPOKEN_TEXT,
      },
      {
        automationClient: mock.supabase,
        createSpeech: mockCreateSpeech,
        now: () => WORKER_A_CLAIM_AT,
      },
    );

    expect(result.resultCode).toBe(
      MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
    );
    expect(mock.getRow()?.audio_status).not.toBe("ready");
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
