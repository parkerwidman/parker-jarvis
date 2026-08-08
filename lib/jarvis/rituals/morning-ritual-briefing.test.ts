import { describe, expect, it } from "vitest";

import {
  MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import {
  DEFAULT_TTS_FORMAT,
  MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  resolveMorningBriefTtsConfig,
} from "@/lib/jarvis/audio/tts-config";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";
import {
  buildMorningRitualBriefingFromRow,
  resolveMorningRitualPlaybackReadiness,
  validateMorningRitualBriefingTimeline,
  type MorningBriefingRowForRitual,
} from "@/lib/jarvis/rituals/morning-ritual-briefing";

const BRIEFING_DATE = "2026-08-07";
const TRANSCRIPT =
  "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. Personal mode makes the most sense this morning. Have a focused day.";

function expectedContentHash(text = TRANSCRIPT) {
  const config = resolveMorningBriefTtsConfig();
  return computeTtsContentHash({
    text,
    model: config.model,
    voice: config.voice,
    format: DEFAULT_TTS_FORMAT,
    instructionVersion: MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  });
}

function buildValidTimeline() {
  const sentences = segmentMorningBriefSentences(TRANSCRIPT);

  return {
    version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
    sentences: sentences.map((text, index) => ({
      index,
      text,
      startMs: index * 5000,
      endMs: index * 5000 + 4800,
    })),
  };
}

function createReadyRow(
  overrides: Partial<MorningBriefingRowForRitual> = {},
): MorningBriefingRowForRitual {
  const contentHash = expectedContentHash();
  const timeline = buildValidTimeline();

  return {
    briefing_date: BRIEFING_DATE,
    status: "completed",
    content: TRANSCRIPT,
    audio_status: "ready",
    audio_generated_at: "2026-08-07T12:00:00.000Z",
    audio_content_hash: contentHash,
    audio_timeline: timeline,
    audio_timeline_content_hash: contentHash,
    audio_duration_ms: 25320,
    audio_timeline_generated_at: "2026-08-07T12:05:00.000Z",
    audio_timeline_model: "whisper-1",
    audio_timeline_error_code: null,
    recommended_mode: null,
    recommendation_sentence_index: null,
    ...overrides,
  };
}

describe("validateMorningRitualBriefingTimeline", () => {
  it("accepts a valid ready timeline aligned to the transcript", () => {
    const row = createReadyRow();
    const timeline = validateMorningRitualBriefingTimeline(row, TRANSCRIPT);

    expect(timeline).not.toBeNull();
    expect(timeline?.durationMs).toBe(25320);
    expect(timeline?.sentences).toHaveLength(5);
  });

  it("rejects when audio is not ready", () => {
    const row = createReadyRow({ audio_status: "pending" });

    expect(validateMorningRitualBriefingTimeline(row, TRANSCRIPT)).toBeNull();
  });

  it("rejects malformed timeline shape", () => {
    const row = createReadyRow({
      audio_timeline: { version: 1, sentences: [] },
    });

    expect(validateMorningRitualBriefingTimeline(row, TRANSCRIPT)).toBeNull();
  });

  it("rejects timeline sentence count mismatch", () => {
    const row = createReadyRow({
      audio_timeline: {
        version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
        sentences: [
          {
            index: 0,
            text: "Only one sentence.",
            startMs: 0,
            endMs: 1000,
          },
        ],
      },
    });

    expect(validateMorningRitualBriefingTimeline(row, TRANSCRIPT)).toBeNull();
  });

  it("rejects non-sequential sentence indexes", () => {
    const timeline = buildValidTimeline();
    timeline.sentences[2].index = 9;

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).toBeNull();
  });

  it("rejects backwards overlap timing", () => {
    const timeline = buildValidTimeline();
    timeline.sentences[2].startMs = 100;
    timeline.sentences[2].endMs = 200;

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).toBeNull();
  });

  it("rejects final end beyond duration tolerance", () => {
    const timeline = buildValidTimeline();
    const last = timeline.sentences[timeline.sentences.length - 1];
    last.endMs = 30000;

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).toBeNull();
  });

  it("rejects timeline hash mismatch", () => {
    const row = createReadyRow({
      audio_timeline_content_hash: "deadbeef".repeat(8),
    });

    expect(validateMorningRitualBriefingTimeline(row, TRANSCRIPT)).toBeNull();
  });

  it("rejects a same-count timeline with wrong sentence text", () => {
    const timeline = buildValidTimeline();
    timeline.sentences[2].text = "Stale sentence from another transcript.";

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).toBeNull();
  });

  it("rejects when only one sentence text mismatches canonical content", () => {
    const timeline = buildValidTimeline();
    timeline.sentences[4].text = "Have a focused day!";

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).toBeNull();
  });

  it("accepts exact canonical sentence text for every timeline entry", () => {
    const timeline = buildValidTimeline();
    const canonical = segmentMorningBriefSentences(TRANSCRIPT);

    for (const [index, sentence] of timeline.sentences.entries()) {
      expect(sentence.text).toBe(canonical[index]);
    }

    expect(
      validateMorningRitualBriefingTimeline(
        createReadyRow({ audio_timeline: timeline }),
        TRANSCRIPT,
      ),
    ).not.toBeNull();
  });
});

describe("buildMorningRitualBriefingFromRow", () => {
  it("returns null for incomplete briefings", () => {
    expect(
      buildMorningRitualBriefingFromRow(
        createReadyRow({ status: "generating", content: null }),
      ),
    ).toBeNull();
  });

  it("keeps all safe briefing fields on the same row", () => {
    const row = createReadyRow({
      recommended_mode: "personal",
      recommendation_sentence_index: 3,
    });
    const briefing = buildMorningRitualBriefingFromRow(row);

    expect(briefing).toMatchObject({
      briefingDate: BRIEFING_DATE,
      transcript: TRANSCRIPT,
      audioStatus: "ready",
      audioGeneratedAt: row.audio_generated_at,
      recommendedMode: "personal",
      recommendationSentenceIndex: 3,
    });
    expect(briefing?.timeline?.durationMs).toBe(25320);
  });

  it("does not expose hash, path, userId, or source_counts fields", () => {
    const briefing = buildMorningRitualBriefingFromRow(createReadyRow());
    const serialized = JSON.stringify(briefing);

    expect(serialized).not.toContain("audio_content_hash");
    expect(serialized).not.toContain("audio_storage_path");
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("source_counts");
    expect(serialized).not.toContain("signed");
  });

  it("uses conservative transcript fallback for existing rows without metadata", () => {
    const briefing = buildMorningRitualBriefingFromRow(createReadyRow());

    expect(briefing?.recommendedMode).toBe("personal");
    expect(briefing?.recommendationSentenceIndex).toBe(3);
  });

  it("returns null recommendation when transcript has no explicit mode sentence", () => {
    const transcriptWithoutMode =
      "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. Have a focused day.";
    const contentHash = expectedContentHash(transcriptWithoutMode);
    const sentences = segmentMorningBriefSentences(transcriptWithoutMode);
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({
        content: transcriptWithoutMode,
        audio_content_hash: contentHash,
        audio_timeline_content_hash: contentHash,
        audio_timeline: {
          version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
          sentences: sentences.map((text, index) => ({
            index,
            text,
            startMs: index * 5000,
            endMs: index * 5000 + 4800,
          })),
        },
      }),
    );

    expect(briefing?.recommendedMode).toBeNull();
    expect(briefing?.recommendationSentenceIndex).toBeNull();
  });

  it("exposes valid persisted recommendation metadata", () => {
    const melusiTranscript =
      "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. I'd run Melusi mode this morning. Have a focused day.";
    const contentHash = expectedContentHash(melusiTranscript);
    const sentences = segmentMorningBriefSentences(melusiTranscript);
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({
        content: melusiTranscript,
        audio_content_hash: contentHash,
        audio_timeline_content_hash: contentHash,
        recommended_mode: "melusi",
        recommendation_sentence_index: 3,
        audio_timeline: {
          version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
          sentences: sentences.map((text, index) => ({
            index,
            text,
            startMs: index * 5000,
            endMs: index * 5000 + 4800,
          })),
        },
      }),
    );

    expect(briefing?.recommendedMode).toBe("melusi");
    expect(briefing?.recommendationSentenceIndex).toBe(3);
  });

  it("returns null recommendation for malformed persisted metadata", () => {
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({
        recommended_mode: "personal",
        recommendation_sentence_index: null,
      }),
    );

    expect(briefing?.recommendedMode).toBeNull();
    expect(briefing?.recommendationSentenceIndex).toBeNull();
  });
});

describe("resolveMorningRitualPlaybackReadiness", () => {
  it("returns no_brief when briefing is null", () => {
    expect(resolveMorningRitualPlaybackReadiness(null)).toBe("no_brief");
  });

  it("returns audio_not_ready when audio is not ready", () => {
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({ audio_status: "generating", audio_timeline: null }),
    );

    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe(
      "audio_not_ready",
    );
  });

  it("returns timeline_missing when audio is ready but timeline is invalid", () => {
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({ audio_timeline: null, audio_timeline_content_hash: null }),
    );

    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe(
      "timeline_missing",
    );
  });

  it("returns timeline_missing when timeline sentence text does not match transcript", () => {
    const timeline = buildValidTimeline();
    timeline.sentences[1].text = "Wrong sentence text entirely.";

    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({ audio_timeline: timeline }),
    );

    expect(briefing?.timeline).toBeNull();
    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe(
      "timeline_missing",
    );
  });

  it("returns ready when audio and timeline are valid even without recommendation", () => {
    const transcriptWithoutMode =
      "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. Have a focused day.";
    const contentHash = expectedContentHash(transcriptWithoutMode);
    const sentences = segmentMorningBriefSentences(transcriptWithoutMode);
    const briefing = buildMorningRitualBriefingFromRow(
      createReadyRow({
        content: transcriptWithoutMode,
        audio_content_hash: contentHash,
        audio_timeline_content_hash: contentHash,
        audio_timeline: {
          version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
          sentences: sentences.map((text, index) => ({
            index,
            text,
            startMs: index * 5000,
            endMs: index * 5000 + 4800,
          })),
        },
      }),
    );

    expect(briefing?.recommendedMode).toBeNull();
    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe("ready");
  });

  it("returns ready for a valid Aug 7-style row", () => {
    const briefing = buildMorningRitualBriefingFromRow(createReadyRow());

    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe("ready");
  });
});

describe("Aug 7 compatibility", () => {
  it("exposes real timeline and conservative recommendation fallback without metadata backfill", () => {
    const row = createReadyRow({
      recommended_mode: null,
      recommendation_sentence_index: null,
    });
    const briefing = buildMorningRitualBriefingFromRow(row);

    expect(briefing?.timeline?.durationMs).toBe(25320);
    expect(briefing?.timeline?.sentences).toHaveLength(5);
    expect(briefing?.recommendedMode).toBe("personal");
    expect(resolveMorningRitualPlaybackReadiness(briefing)).toBe("ready");
  });
});
