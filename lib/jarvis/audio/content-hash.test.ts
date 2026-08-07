import { describe, expect, it } from "vitest";

import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import {
  DEFAULT_TTS_FORMAT,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
} from "@/lib/jarvis/audio/tts-config";

const SAMPLE_TEXT =
  "Good morning, Parker. Your top priority is finishing the proposal.";

function baseHashInput(overrides: Record<string, string> = {}) {
  return {
    text: SAMPLE_TEXT,
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
    format: DEFAULT_TTS_FORMAT,
    instructionVersion: MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
    ...overrides,
  };
}

describe("computeTtsContentHash", () => {
  it("produces a deterministic lowercase SHA-256 hex hash for the same input", () => {
    const first = computeTtsContentHash(baseHashInput());
    const second = computeTtsContentHash(baseHashInput());

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when spoken text changes", () => {
    const original = computeTtsContentHash(baseHashInput());
    const changed = computeTtsContentHash(
      baseHashInput({ text: `${SAMPLE_TEXT} Updated.` }),
    );

    expect(changed).not.toBe(original);
  });

  it("changes when model changes", () => {
    const original = computeTtsContentHash(baseHashInput());
    const changed = computeTtsContentHash(
      baseHashInput({ model: "tts-1-hd" }),
    );

    expect(changed).not.toBe(original);
  });

  it("changes when voice changes", () => {
    const original = computeTtsContentHash(baseHashInput());
    const changed = computeTtsContentHash(baseHashInput({ voice: "alloy" }));

    expect(changed).not.toBe(original);
  });

  it("changes when instruction version changes", () => {
    const original = computeTtsContentHash(baseHashInput());
    const changed = computeTtsContentHash(
      baseHashInput({ instructionVersion: "morning-brief-v2" }),
    );

    expect(changed).not.toBe(original);
  });
});
