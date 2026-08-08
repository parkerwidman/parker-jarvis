import { describe, expect, it, vi } from "vitest";

import {
  buildMorningBriefAudioTimeline,
  isValidMorningBriefAudioTimeline,
} from "@/lib/jarvis/briefings/build-morning-brief-audio-timeline";

describe("buildMorningBriefAudioTimeline", () => {
  it("builds timeline from mocked transcription output without live OpenAI calls", async () => {
    const mockCreateWordTimestamps = vi.fn().mockResolvedValue({
      success: true,
      result: {
        durationSeconds: 3.0,
        words: [
          { word: "Good", start: 0.0, end: 0.2 },
          { word: "morning", start: 0.2, end: 0.5 },
          { word: "Parker", start: 0.5, end: 0.9 },
          { word: "Your", start: 1.0, end: 1.2 },
          { word: "top", start: 1.2, end: 1.4 },
          { word: "priority", start: 1.4, end: 1.8 },
          { word: "is", start: 1.8, end: 1.9 },
          { word: "finishing", start: 1.9, end: 2.3 },
          { word: "the", start: 2.3, end: 2.4 },
          { word: "proposal", start: 2.4, end: 2.9 },
        ],
      },
    });

    const result = await buildMorningBriefAudioTimeline(
      new Uint8Array([1, 2, 3]),
      "Good morning, Parker. Your top priority is finishing the proposal.",
      { createWordTimestamps: mockCreateWordTimestamps },
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(isValidMorningBriefAudioTimeline(result.timeline)).toBe(true);
    expect(result.durationMs).toBe(3000);
    expect(result.model).toBe("whisper-1");
    expect(mockCreateWordTimestamps).toHaveBeenCalledTimes(1);
  });
});
