import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
  MORNING_BRIEF_TIMELINE_ERROR_CODES,
  type MorningBriefAudioTimeline,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import { buildMorningBriefAudioStoragePath } from "@/lib/jarvis/audio/storage-path";
import {
  DEFAULT_TTS_FORMAT,
  MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  resolveMorningBriefTtsConfig,
} from "@/lib/jarvis/audio/tts-config";
import {
  ensureMorningBriefAudioTimeline,
  generateAndPersistMorningBriefAudioTimeline,
} from "@/lib/jarvis/briefings/ensure-morning-brief-audio-timeline";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRIEFING_DATE = "2026-08-07";
const SPOKEN_TEXT =
  "Good morning, Parker. Your top priority is finishing the proposal.";

const TIMELINE: MorningBriefAudioTimeline = {
  version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
  sentences: [
    {
      index: 0,
      text: "Good morning, Parker.",
      startMs: 0,
      endMs: 900,
    },
    {
      index: 1,
      text: "Your top priority is finishing the proposal.",
      startMs: 1000,
      endMs: 2900,
    },
  ],
};

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

type TimelineRow = {
  content: string;
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
  audio_timeline: MorningBriefAudioTimeline | null;
  audio_timeline_content_hash: string | null;
  audio_duration_ms: number | null;
  audio_timeline_generated_at: string | null;
  audio_timeline_model: string | null;
  audio_timeline_error_code: string | null;
  status?: string;
};

const mockBuildTimeline = vi.fn();

function createReadyRow(contentHash: string): TimelineRow {
  return {
    content: SPOKEN_TEXT,
    audio_status: "ready",
    audio_content_hash: contentHash,
    audio_storage_path: buildMorningBriefAudioStoragePath(
      USER_ID,
      BRIEFING_DATE,
      contentHash,
    ),
    audio_timeline: null,
    audio_timeline_content_hash: null,
    audio_duration_ms: null,
    audio_timeline_generated_at: null,
    audio_timeline_model: null,
    audio_timeline_error_code: null,
    status: "completed",
  };
}

function createMockAutomationClient(initialRow: TimelineRow | null) {
  let row: TimelineRow | null = initialRow ? { ...initialRow } : null;
  const updates: Array<Record<string, unknown>> = [];

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

        const filters: Record<string, unknown> = {};
        const chain = {
          eq: vi.fn(function eqColumn(column: string, value: unknown) {
            filters[column] = value;
            return chain;
          }),
          or: vi.fn(function orFilter() {
            return chain;
          }),
          select: vi.fn(function selectColumns() {
            return {
              maybeSingle: vi.fn(async () => {
                if (!row) {
                  return { data: null, error: null };
                }

                const contentHash = expectedContentHash();
                const canPersistTimeline =
                  row.audio_status === "ready" &&
                  row.audio_content_hash === contentHash &&
                  filters.audio_status === "ready" &&
                  filters.audio_content_hash === contentHash &&
                  (row.audio_timeline_content_hash === null ||
                    row.audio_timeline_content_hash !== contentHash ||
                    row.audio_timeline === null);

                if (!canPersistTimeline) {
                  return { data: null, error: null };
                }

                row = {
                  ...row,
                  ...payload,
                } as TimelineRow;

                if (payload.audio_timeline_error_code && payload.audio_timeline === null) {
                  row = {
                    ...row,
                    audio_timeline: null,
                    audio_timeline_content_hash: null,
                    audio_duration_ms: null,
                    audio_timeline_generated_at: null,
                    audio_timeline_model: null,
                  };
                }

                return { data: { id: "brief-1" }, error: null };
              }),
            };
          }),
        };

        return chain;
      }),
    })),
  } as unknown as SupabaseClient;

  return { supabase, updates, getRow: () => row, setRow: (nextRow: TimelineRow | null) => {
    row = nextRow ? { ...nextRow } : null;
  } };
}

describe("ensureMorningBriefAudioTimeline", () => {
  beforeEach(() => {
    mockBuildTimeline.mockReset();
    mockBuildTimeline.mockResolvedValue({
      success: true,
      timeline: TIMELINE,
      durationMs: 3000,
      model: "whisper-1",
    });
  });

  it("skips transcription when a valid same-hash timeline already exists", async () => {
    const contentHash = expectedContentHash();
    const { supabase } = createMockAutomationClient({
      ...createReadyRow(contentHash),
      audio_timeline: TIMELINE,
      audio_timeline_content_hash: contentHash,
      audio_duration_ms: 3000,
      audio_timeline_generated_at: "2026-08-07T12:00:00.000Z",
      audio_timeline_model: "whisper-1",
      audio_timeline_error_code: null,
    });

    const downloadAudio = vi.fn();

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio,
      },
    );

    expect(result).toEqual({
      resultCode: "ready",
      timeline: TIMELINE,
      durationMs: 3000,
      contentHash,
      reused: true,
    });
    expect(mockBuildTimeline).not.toHaveBeenCalled();
    expect(downloadAudio).not.toHaveBeenCalled();
  });

  it("downloads ready MP3 and aligns when timeline metadata is missing", async () => {
    const contentHash = expectedContentHash();
    const { supabase, updates } = createMockAutomationClient(
      createReadyRow(contentHash),
    );
    const downloadAudio = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio,
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result.resultCode).toBe("ready");
    expect(downloadAudio).toHaveBeenCalledTimes(1);
    expect(mockBuildTimeline).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      SPOKEN_TEXT,
    );
    expect(updates.at(-1)).toMatchObject({
      audio_timeline: TIMELINE,
      audio_timeline_content_hash: contentHash,
      audio_duration_ms: 3000,
      audio_timeline_model: "whisper-1",
      audio_timeline_error_code: null,
    });
  });

  it("does not overwrite a valid timeline for a stale different audio hash", async () => {
    const currentHash = expectedContentHash();
    const staleHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { supabase, getRow } = createMockAutomationClient({
      ...createReadyRow(currentHash),
      audio_timeline: TIMELINE,
      audio_timeline_content_hash: currentHash,
      audio_duration_ms: 3000,
      audio_timeline_generated_at: "2026-08-07T12:00:00.000Z",
      audio_timeline_model: "whisper-1",
      audio_timeline_error_code: null,
    });

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    );

    expect(result.reused).toBe(true);
    expect(getRow()?.audio_timeline_content_hash).toBe(currentHash);
    expect(getRow()?.audio_timeline_content_hash).not.toBe(staleHash);
    expect(mockBuildTimeline).not.toHaveBeenCalled();
  });

  it("records timeline failure without changing briefing text status or deleting audio", async () => {
    const contentHash = expectedContentHash();
    const { supabase, getRow } = createMockAutomationClient(
      createReadyRow(contentHash),
    );

    mockBuildTimeline.mockResolvedValue({
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
    });

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    );

    expect(result.resultCode).toBe(
      MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
    );
    expect(getRow()?.status).toBe("completed");
    expect(getRow()?.audio_status).toBe("ready");
    expect(getRow()?.audio_storage_path).toBe(
      buildMorningBriefAudioStoragePath(USER_ID, BRIEFING_DATE, contentHash),
    );
    expect(getRow()?.audio_timeline_error_code).toBe(
      MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
    );
  });

  it("keeps storage download server-side and does not expose paths in results", async () => {
    const contentHash = expectedContentHash();
    const storagePath = buildMorningBriefAudioStoragePath(
      USER_ID,
      BRIEFING_DATE,
      contentHash,
    );
    const downloadAudio = vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9]));
    const { supabase } = createMockAutomationClient(createReadyRow(contentHash));

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio,
      },
    );

    expect(downloadAudio).toHaveBeenCalledWith(expect.anything(), storagePath);
    expect(JSON.stringify(result)).not.toContain(storagePath);
    expect(JSON.stringify(result)).not.toContain("signed");
    expect(JSON.stringify(result)).not.toContain("supabase");
  });

  it("persists failure state with all success timeline fields null", async () => {
    const contentHash = expectedContentHash();
    const { supabase, getRow } = createMockAutomationClient(
      createReadyRow(contentHash),
    );

    mockBuildTimeline.mockResolvedValue({
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.transcriptionFailed,
    });

    await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    );

    expect(getRow()?.audio_timeline).toBeNull();
    expect(getRow()?.audio_timeline_content_hash).toBeNull();
    expect(getRow()?.audio_duration_ms).toBeNull();
    expect(getRow()?.audio_timeline_generated_at).toBeNull();
    expect(getRow()?.audio_timeline_model).toBeNull();
    expect(getRow()?.audio_timeline_error_code).toBe(
      MORNING_BRIEF_TIMELINE_ERROR_CODES.transcriptionFailed,
    );
  });

  it("does not overwrite a valid same-hash timeline with a transient failure", async () => {
    const contentHash = expectedContentHash();
    const mock = createMockAutomationClient({
      ...createReadyRow(contentHash),
      audio_timeline: TIMELINE,
      audio_timeline_content_hash: contentHash,
      audio_duration_ms: 3000,
      audio_timeline_generated_at: "2026-08-07T12:00:00.000Z",
      audio_timeline_model: "whisper-1",
      audio_timeline_error_code: null,
    });

    mockBuildTimeline.mockResolvedValue({
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
    });

    const result = await ensureMorningBriefAudioTimeline(
      { userId: USER_ID, briefingDate: BRIEFING_DATE },
      {
        automationClient: mock.supabase,
        buildTimeline: mockBuildTimeline,
        downloadAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    );

    expect(result).toMatchObject({
      resultCode: "ready",
      reused: true,
      contentHash,
    });
    expect(mock.getRow()?.audio_timeline).toEqual(TIMELINE);
    expect(mock.getRow()?.audio_timeline_error_code).toBeNull();
    expect(mockBuildTimeline).not.toHaveBeenCalled();
  });

  it("rejects stale timeline persistence when audio hash changed after build", async () => {
    const contentHash = expectedContentHash();
    const newHash = "c".repeat(64);
    const mock = createMockAutomationClient(createReadyRow(contentHash));

    mockBuildTimeline.mockImplementationOnce(async () => {
      mock.setRow({
        ...createReadyRow(newHash),
        audio_timeline: null,
        audio_timeline_content_hash: null,
        audio_duration_ms: null,
        audio_timeline_generated_at: null,
        audio_timeline_model: null,
        audio_timeline_error_code: null,
      });
      return {
        success: true,
        timeline: TIMELINE,
        durationMs: 3000,
        model: "whisper-1",
      };
    });

    const result = await generateAndPersistMorningBriefAudioTimeline({
      supabase: mock.supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      normalizedSpokenContent: SPOKEN_TEXT,
      contentHash,
      audioBytes: new Uint8Array([1, 2, 3]),
      buildTimeline: mockBuildTimeline,
    });

    expect(result).toEqual({
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    });
    expect(mock.getRow()?.audio_timeline).toBeNull();
    expect(mock.getRow()?.audio_timeline_content_hash).toBeNull();
  });

  it("does not persist timeline failure for a stale audio hash", async () => {
    const contentHash = expectedContentHash();
    const newHash = "d".repeat(64);
    const mock = createMockAutomationClient(createReadyRow(contentHash));

    mockBuildTimeline.mockImplementationOnce(async () => {
      mock.setRow({
        ...createReadyRow(newHash),
        audio_timeline: null,
        audio_timeline_content_hash: null,
        audio_duration_ms: null,
        audio_timeline_generated_at: null,
        audio_timeline_model: null,
        audio_timeline_error_code: null,
      });
      return {
        success: false,
        errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
      };
    });

    const result = await generateAndPersistMorningBriefAudioTimeline({
      supabase: mock.supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      normalizedSpokenContent: SPOKEN_TEXT,
      contentHash,
      audioBytes: new Uint8Array([1, 2, 3]),
      buildTimeline: mockBuildTimeline,
    });

    expect(result).toEqual({
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    });
    expect(mock.getRow()?.audio_timeline_error_code).toBeNull();
  });
});
