import { describe, expect, it } from "vitest";

import {
  BRIEFING_WAVEFORM_BAR_COUNT,
  buildBriefingWaveformBarHeights,
} from "@/lib/jarvis/briefings/briefing-waveform";

describe("briefing waveform", () => {
  it("returns deterministic integer bar heights", () => {
    const first = buildBriefingWaveformBarHeights();
    const second = buildBriefingWaveformBarHeights();

    expect(first).toEqual(second);
    expect(first).toHaveLength(BRIEFING_WAVEFORM_BAR_COUNT);
    expect(first.every((height) => Number.isInteger(height))).toBe(true);
    expect(first.every((height) => height >= 6 && height <= 34)).toBe(true);
  });

  it("matches expected heights for sample indices", () => {
    const heights = buildBriefingWaveformBarHeights();

    expect(heights[0]).toBe(20);
    expect(heights[1]).toBe(25);
    expect(heights[2]).toBe(29);
    expect(heights[3]).toBe(32);
  });
});
