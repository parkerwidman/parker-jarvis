import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BriefingPlayer } from "./briefing-player";
import { CommandCenterModeProvider } from "./command-center-mode-provider";

const TRANSCRIPT = "Good morning Parker. Your top priority is Melusi outreach.";

function renderPlayer(
  props: Partial<ComponentProps<typeof BriefingPlayer>> = {},
) {
  return renderToStaticMarkup(
    createElement(
      CommandCenterModeProvider,
      null,
      createElement(BriefingPlayer, {
        transcript: TRANSCRIPT,
        priorityText: "Melusi outreach",
        briefingStatus: "completed",
        audioStatus: "ready",
        audioGeneratedAt: "2026-08-07T08:00:00.000Z",
        briefingDate: "2026-08-07",
        onFollowUp: () => {},
        followUpLoading: false,
        followUpUsed: new Set<string>(),
        ...props,
      }),
    ),
  );
}

describe("BriefingPlayer", () => {
  it("does not embed a signed URL on initial ready render", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).not.toContain("supabase");
    expect(html).not.toContain("signedUrl");
    expect(html).not.toContain("object/sign");
  });

  it("shows an enabled play control when audio is ready", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain("cc2-play-btn--enabled");
    expect(html).toContain('aria-label="Play morning briefing"');
  });

  it("disables play for generating audio status", () => {
    const html = renderPlayer({ audioStatus: "generating" });

    expect(html).not.toContain("cc2-play-btn--enabled");
    expect(html).toContain("Generating audio…");
    expect(html).toContain("Check again");
  });

  it("offers generate/retry actions for none and failed states", () => {
    const noneHtml = renderPlayer({ audioStatus: "none" });
    expect(noneHtml).toContain("Generate audio");
    expect(noneHtml).toContain("Audio not generated yet");

    const failedHtml = renderPlayer({ audioStatus: "failed" });
    expect(failedHtml).toContain("Retry audio");
    expect(failedHtml).toContain("Audio unavailable");
  });

  it("does not offer generate/retry actions without a briefing date", () => {
    const html = renderPlayer({
      audioStatus: "none",
      briefingDate: null,
    });

    expect(html).not.toContain("Generate audio");
    expect(html).not.toContain("Retry audio");
    expect(html).not.toContain("cc2-audio-retry-btn");
  });

  it("renders seek input and time labels for ready playback", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain('aria-label="Seek morning briefing playback"');
    expect(html).toContain("0:00");
    expect(html).toContain('type="range"');
  });

  it("keeps transcript UI unchanged and accessible", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain("Hide transcript");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Melusi outreach");
    expect(html).not.toContain("word-timestamp");
  });

  it("uses waveform bar classes for honest progress styling", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain("cc2-wave-bar");
    expect(html).toContain("cc2-wave");
  });

  it("includes hidden audio element with preload none", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain("<audio");
    expect(html).toContain('preload="none"');
  });

  it("preserves follow-up controls and mode switcher", () => {
    const html = renderPlayer({ audioStatus: "ready" });

    expect(html).toContain("Ask a follow-up");
    expect(html).toContain("Switch to personal");
    expect(html).toContain("Go to Melusi");
  });
});
