import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FullMorningRitual } from "@/components/jarvis/morning-ritual/full-morning-ritual";
import { RitualRing } from "@/components/jarvis/morning-ritual/ritual-ring";
import { RitualTranscript } from "@/components/jarvis/morning-ritual/ritual-transcript";
import { DEMO_RITUAL_TRANSCRIPT } from "@/lib/jarvis/morning-ritual/demo-ritual-timeline";

const ROOT = resolve(import.meta.dirname, "../../..");
const SLEEP_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/sleep-screen.tsx",
);
const FULL_RITUAL_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/full-morning-ritual.tsx",
);
const GATE_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-gate.tsx",
);
const BRIEFING_PLAYER_PATH = resolve(
  ROOT,
  "components/jarvis/command-center/briefing-player.tsx",
);
const HOME_PAGE_PATH = resolve(ROOT, "app/page.tsx");
const LOGIN_ACTIONS_PATH = resolve(ROOT, "app/login/actions.ts");

function renderFullRitual(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(FullMorningRitual, {
      displayName: "Alex",
      ritualDate: "2026-08-07",
      transcript: DEMO_RITUAL_TRANSCRIPT,
      activeSentenceIndex: 0,
      recommendedMode: null,
      modeRevealed: false,
      isPlaying: false,
      isFinished: false,
      demoMode: false,
      ...overrides,
    }),
  );
}

describe("FullMorningRitual phase 4 visuals", () => {
  it("renders greeting, date, ring, transcript, and enter button shell", () => {
    const html = renderFullRitual();

    expect(html).toContain("Good morning,");
    expect(html).toContain("Alex");
    expect(html).toContain("Friday, August 7, 2026");
    expect(html).toContain('data-testid="ritual-ring-wrapper"');
    expect(html).toContain('data-testid="ritual-transcript"');
    expect(html).toContain("Enter Jarvis");
  });

  it("renders all transcript sentences", () => {
    const html = renderFullRitual();
    expect(html).toContain("Two things stand out today.");
    expect(html).toContain("On Melusi, 2 leads have been waiting over a day.");
    expect(html).toContain("Content posting is still 0 of 4 for the week.");
    expect(html).toContain("nothing&#x27;s overdue — your next deadline is 6 days out.");
    expect(html).toContain("Suggest Melusi mode, starting with the leads.");
    expect(html.match(/data-testid="ritual-transcript-sentence"/g)?.length).toBe(5);
  });

  it("marks only the expected sentence as active", () => {
    const html = renderFullRitual({ activeSentenceIndex: 2 });
    const activeMatches = html.match(/data-active="true"/g)?.length ?? 0;
    expect(activeMatches).toBe(1);
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Content posting is still 0 of 4 for the week.");
  });

  it("hides Enter Jarvis before finish", () => {
    const html = renderFullRitual({ isFinished: false });
    expect(html).toContain('data-visible="false"');
  });

  it("shows Enter Jarvis after finish", () => {
    const html = renderFullRitual({
      isFinished: true,
      recommendedMode: "melusi",
      modeRevealed: true,
    });
    expect(html).toContain('data-visible="true"');
  });

  it("renders 60 outer bars, 40 inner bars, 24 ticks, radar sweep, and 3 orbit dots", () => {
    const html = renderToStaticMarkup(
      createElement(RitualRing, {
        recommendedMode: null,
        modeRevealed: false,
        isPlaying: false,
      }),
    );

    expect(html.match(/data-testid="ritual-outer-bar"/g)?.length).toBe(60);
    expect(html.match(/data-testid="ritual-inner-bar"/g)?.length).toBe(40);
    expect(html.match(/data-testid="ritual-tick"/g)?.length).toBe(24);
    expect(html).toContain('data-testid="ritual-radar-sweep"');
    expect(html.match(/data-testid="ritual-orbit-dot"/g)?.length).toBe(3);
  });

  it("uses Melusi accent on reveal", () => {
    const html = renderFullRitual({
      recommendedMode: "melusi",
      modeRevealed: true,
      activeSentenceIndex: 4,
    });
    expect(html).toContain("#3B7DDD");
  });

  it("uses Personal accent on reveal", () => {
    const html = renderFullRitual({
      recommendedMode: "personal",
      modeRevealed: true,
      activeSentenceIndex: 4,
    });
    expect(html).toContain("#F0A93B");
  });

  it("keeps transcript sentences mounted across active changes", () => {
    const inactive = renderToStaticMarkup(
      createElement(RitualTranscript, {
        sentences: DEMO_RITUAL_TRANSCRIPT,
        activeSentenceIndex: 0,
      }),
    );
    const active = renderToStaticMarkup(
      createElement(RitualTranscript, {
        sentences: DEMO_RITUAL_TRANSCRIPT,
        activeSentenceIndex: 3,
      }),
    );

    expect(inactive).toContain("Two things stand out today.");
    expect(inactive).toContain("nothing&#x27;s overdue — your next deadline is 6 days out.");
    expect(active).toContain("Two things stand out today.");
    expect(active).toContain("nothing&#x27;s overdue — your next deadline is 6 days out.");
    expect(inactive.match(/data-testid="ritual-transcript-sentence"/g)?.length).toBe(5);
    expect(active.match(/data-testid="ritual-transcript-sentence"/g)?.length).toBe(5);
  });
});

describe("Sleep screen phase 4 demo transition", () => {
  it("transitions locally on Sign in without backend calls", () => {
    const source = readFileSync(SLEEP_PATH, "utf8");
    expect(source).toContain("FullMorningRitualDemo");
    expect(source).toContain("setShowRitual(true)");
    expect(source).not.toMatch(/startDailyRitual/);
    expect(source).not.toMatch(/completeDailyRitual/);
    expect(source).not.toMatch(/router\.push/);
    expect(source).not.toMatch(/redirect\("/);
  });

  it("does not call audio, API, or OpenAI from ritual visuals", () => {
    const sources = [
      readFileSync(SLEEP_PATH, "utf8"),
      readFileSync(FULL_RITUAL_PATH, "utf8"),
      readFileSync(GATE_PATH, "utf8"),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/startDailyRitual/);
      expect(source).not.toMatch(/completeDailyRitual/);
      expect(source).not.toMatch(/generateMorningBrief/);
      expect(source).not.toMatch(/generateMorningBriefAudio/);
      expect(source).not.toMatch(/openai/i);
      expect(source).not.toMatch(/fetch\(/);
    }
  });

  it("keeps Command Center, home page, and login redirect untouched", () => {
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");
    const briefingSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");

    expect(homeSource).toContain("loadCommandCenter");
    expect(homeSource).not.toContain("MorningRitualGate");
    expect(loginSource).toContain('redirect("/")');
    expect(loginSource).not.toContain('redirect("/wake")');
    expect(briefingSource).toContain("BriefingPlayer");
    expect(briefingSource).not.toContain("FullMorningRitual");
  });
});
