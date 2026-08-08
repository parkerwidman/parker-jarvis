import { describe, expect, it, vi } from "vitest";

import { createWordTimestamps } from "@/lib/jarvis/audio/create-word-timestamps";

describe("createWordTimestamps", () => {
  it("returns validated word timestamps without exposing raw OpenAI objects", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      duration: 2.5,
      words: [
        { word: "Good", start: 0, end: 0.2 },
        { word: "morning", start: 0.2, end: 0.5 },
      ],
    });

    const client = {
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    };

    const result = await createWordTimestamps(new Uint8Array([1, 2, 3]), {
      transcript: "Good morning",
      client: client as never,
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.result).toEqual({
      durationSeconds: 2.5,
      words: [
        { word: "Good", start: 0, end: 0.2 },
        { word: "morning", start: 0.2, end: 0.5 },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
        prompt: "Good morning",
      }),
    );
  });

  it("returns sanitized failure codes for invalid responses", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ duration: 1, words: [] });
    const client = {
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    };

    const result = await createWordTimestamps(new Uint8Array([1, 2, 3]), {
      client: client as never,
    });

    expect(result).toEqual({
      success: false,
      errorCode: "timeline_transcription_failed",
    });
  });
});
