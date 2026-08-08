import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MorningRitualGate } from "@/components/jarvis/morning-ritual/morning-ritual-gate";
import {
  SLEEP_STARFIELD,
  WELCOME_STARFIELD,
} from "@/lib/jarvis/morning-ritual/starfield";
import type { MorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";

const ROOT = resolve(import.meta.dirname, "../..");
const GATE_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-gate.tsx",
);
const SLEEP_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/sleep-screen.tsx",
);
const WELCOME_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/welcome-back-screen.tsx",
);
const BACKGROUND_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/ritual-background.tsx",
);
const BRIEFING_PLAYER_PATH = resolve(
  ROOT,
  "components/jarvis/command-center/briefing-player.tsx",
);
const HOME_PAGE_PATH = resolve(ROOT, "app/page.tsx");
const LOGIN_ACTIONS_PATH = resolve(ROOT, "app/login/actions.ts");

const FULL_REQUIRED_ENTRY: MorningRitualEntry = {
  displayName: "Alex",
  timezone: "America/Chicago",
  ritualDate: "2026-08-07",
  ritualState: "full_required",
  ritualStatus: "not_started",
  briefingDate: null,
  briefing: null,
  playbackReadiness: "no_brief",
};

const WELCOME_BACK_ENTRY: MorningRitualEntry = {
  displayName: "Alex",
  timezone: "America/Chicago",
  ritualDate: "2026-08-07",
  ritualState: "welcome_back",
  ritualStatus: "completed",
  briefingDate: "2026-08-07",
  briefing: null,
  playbackReadiness: "ready",
};

function renderGate(entry: MorningRitualEntry) {
  return renderToStaticMarkup(createElement(MorningRitualGate, { entry }));
}

describe("MorningRitualGate phase 3 visuals", () => {
  it("renders the sleep screen for full_required", () => {
    const html = renderGate(FULL_REQUIRED_ENTRY);

    expect(html).toContain("JARVIS");
    expect(html).toContain("Sleeping");
    expect(html).toContain("Sign in");
    expect(html).toContain('data-testid="sleep-screen"');
    expect(html).not.toContain("Welcome back");
  });

  it("does not hardcode the user's name into the sleep UI", () => {
    const html = renderGate({
      ...FULL_REQUIRED_ENTRY,
      displayName: "Jordan",
    });

    expect(html).not.toContain("Jordan");
    expect(html).not.toContain("Alex");
    expect(html).not.toContain("Parker");
  });

  it("renders welcome back with the actual display name", () => {
    const html = renderGate({
      ...WELCOME_BACK_ENTRY,
      displayName: "Jordan",
    });

    expect(html).toContain("Welcome back");
    expect(html).toContain("Jordan");
    expect(html).toContain('data-testid="welcome-back-screen"');
  });

  it("includes aurora, grid, stars, and vignette in the background", () => {
    const html = renderGate(FULL_REQUIRED_ENTRY);

    expect(html).toContain('data-testid="ritual-background"');
    expect(html).toContain('data-testid="ritual-aurora-1"');
    expect(html).toContain('data-testid="ritual-aurora-2"');
    expect(html).toContain('data-testid="ritual-aurora-3"');
    expect(html).toContain('data-testid="ritual-grid"');
    expect(html).toContain('data-testid="ritual-starfield"');
    expect(html).toContain('data-testid="ritual-star"');
    expect(html).toContain('data-testid="ritual-vignette"');
  });

  it("uses only aurora 1 and 2 on welcome back", () => {
    const html = renderGate(WELCOME_BACK_ENTRY);

    expect(html).toContain('data-testid="ritual-aurora-1"');
    expect(html).toContain('data-testid="ritual-aurora-2"');
    expect(html).not.toContain('data-testid="ritual-aurora-3"');
  });

  it("renders 55 sleep stars and 45 welcome stars", () => {
    const sleepHtml = renderGate(FULL_REQUIRED_ENTRY);
    const welcomeHtml = renderGate(WELCOME_BACK_ENTRY);

    expect(sleepHtml.match(/data-testid="ritual-star"/g)?.length).toBe(55);
    expect(welcomeHtml.match(/data-testid="ritual-star"/g)?.length).toBe(45);
  });

  it("does not call ritual mutation, audio, generation, or redirect", () => {
    const gateSource = readFileSync(GATE_PATH, "utf8");
    const sleepSource = readFileSync(SLEEP_PATH, "utf8");
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    for (const source of [gateSource, sleepSource, welcomeSource]) {
      expect(source).not.toMatch(/startDailyRitual/);
      expect(source).not.toMatch(/completeDailyRitual/);
      expect(source).not.toMatch(/generateMorningBrief/);
      expect(source).not.toMatch(/generateMorningBriefAudio/);
      expect(source).not.toMatch(/redirect\("/);
      expect(source).not.toMatch(/router\.push/);
      expect(source).not.toMatch(/audio/i);
    }
  });

  it("does not introduce Math.random during render", () => {
    const backgroundSource = readFileSync(BACKGROUND_PATH, "utf8");
    const gateSource = readFileSync(GATE_PATH, "utf8");

    expect(backgroundSource).not.toMatch(/Math\.random/);
    expect(gateSource).not.toMatch(/Math\.random/);
  });

  it("uses precomputed deterministic starfields", () => {
    const sleepSource = readFileSync(SLEEP_PATH, "utf8");
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    expect(sleepSource).toContain("SLEEP_STARFIELD");
    expect(welcomeSource).toContain("WELCOME_STARFIELD");
    expect(SLEEP_STARFIELD).toHaveLength(55);
    expect(WELCOME_STARFIELD).toHaveLength(45);
  });

  it("keeps /wake separate from Command Center and unchanged root/login flows", () => {
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");
    const briefingSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");

    expect(homeSource).toContain("loadCommandCenter");
    expect(homeSource).not.toContain("MorningRitualGate");
    expect(loginSource).toContain('redirect("/")');
    expect(loginSource).not.toContain('redirect("/wake")');
    expect(briefingSource).toContain("BriefingPlayer");
    expect(briefingSource).not.toContain("MorningRitualGate");
  });
});
