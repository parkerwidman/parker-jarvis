import { describe, expect, it } from "vitest";
import {
  buildBriefTranscriptSegments,
  buildPriorityPhraseMatchCandidates,
  emphasizedTranscriptText,
  findPriorityPhraseRangeWithFallback,
  selectBriefTranscriptEmphasisRanges,
  transcriptSegmentsContainHtml,
} from "@/lib/jarvis/briefings/format-brief-transcript";

const PRIORITY_PHRASE =
  "figure out retroactive withdrawal for last semester's classes";
const TRANSCRIPT =
  "Good morning, Parker. The main thing I'd focus on first is your current priority: figure out retroactive withdrawal for last semester's classes. You selected it as your focus, so that's the right place to start. There's nothing important on your calendar today. I'd start by reviewing where it stands and decide the next concrete step.";

describe("brief transcript emphasis", () => {
  it("emphasizes only the exact priority phrase from structured metadata", () => {
    const segments = buildBriefTranscriptSegments(TRANSCRIPT, PRIORITY_PHRASE);
    const emphasized = segments
      .filter((segment) => segment.emphasized)
      .map((segment) => segment.text);

    expect(emphasized).toEqual([PRIORITY_PHRASE]);
    expect(emphasized.some((text) => text.toLowerCase().includes("you selected it"))).toBe(
      false,
    );
    expect(
      emphasized.some((text) =>
        text.toLowerCase().includes("nothing important on your calendar today"),
      ),
    ).toBe(false);
    expect(
      emphasized.some((text) =>
        text.toLowerCase().includes("decide the next concrete step"),
      ),
    ).toBe(false);
  });

  it("supports conservative leading-verb variation fallback", () => {
    const storedWithoutVerb = "retroactive withdrawal for last semester's classes";
    const range = findPriorityPhraseRangeWithFallback(
      TRANSCRIPT,
      storedWithoutVerb,
    );

    expect(range).not.toBeNull();
    expect(TRANSCRIPT.slice(range?.start ?? 0, range?.end ?? 0)).toBe(
      PRIORITY_PHRASE,
    );
    expect(buildPriorityPhraseMatchCandidates(storedWithoutVerb)).toContain(
      PRIORITY_PHRASE,
    );
  });

  it("renders no emphasis for null priority text", () => {
    expect(selectBriefTranscriptEmphasisRanges(TRANSCRIPT, null)).toEqual([]);
    expect(buildBriefTranscriptSegments(TRANSCRIPT, null)).toEqual([
      { text: TRANSCRIPT, emphasized: false },
    ]);
  });

  it("emphasizes only the first matching occurrence", () => {
    const transcript =
      "Finish proposal matters, but Finish proposal today is the focus.";
    const range = findPriorityPhraseRangeWithFallback(transcript, "Finish proposal");

    expect(range).toEqual({ start: 0, end: "Finish proposal".length });
  });

  it("preserves the original displayed text and escapes raw HTML safely", () => {
    const transcript =
      "Good morning, Parker. Top priority: <script>alert(1)</script>. Finish proposal next.";
    const segments = buildBriefTranscriptSegments(transcript, "Finish proposal");

    expect(emphasizedTranscriptText(segments)).toBe(transcript);
    expect(transcriptSegmentsContainHtml(segments)).toBe(true);
    expect(segments.some((segment) => segment.text.includes("<script>"))).toBe(true);
  });
});
