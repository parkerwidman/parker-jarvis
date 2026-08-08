import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const WAKE_PAGE_PATH = resolve(ROOT, "app/wake/page.tsx");
const HOME_PAGE_PATH = resolve(ROOT, "app/page.tsx");
const LOGIN_ACTIONS_PATH = resolve(ROOT, "app/login/actions.ts");
const LOAD_ENTRY_PATH = resolve(
  ROOT,
  "lib/jarvis/rituals/load-morning-ritual-entry.ts",
);
const BRIEFING_PLAYER_PATH = resolve(
  ROOT,
  "components/jarvis/command-center/briefing-player.tsx",
);
const START_ROUTE_PATH = resolve(
  ROOT,
  "app/api/rituals/morning/start/route.ts",
);
const COMPLETE_ROUTE_PATH = resolve(
  ROOT,
  "app/api/rituals/morning/complete/route.ts",
);

describe("Morning Ritual phase 6A safety boundaries", () => {
  it("keeps GET /wake read-only without generation or ritual mutation", () => {
    const source = readFileSync(WAKE_PAGE_PATH, "utf8");
    const loaderSource = readFileSync(LOAD_ENTRY_PATH, "utf8");

    expect(source).toContain("loadMorningRitualEntry");
    expect(source).not.toMatch(/generateMorningBrief/);
    expect(source).not.toMatch(/generateMorningBriefAudio/);
    expect(source).not.toMatch(/ensureMorningBriefAudioTimeline/);
    expect(source).not.toMatch(/startDailyRitual/);
    expect(source).not.toMatch(/completeDailyRitual/);
    expect(source).not.toMatch(/bindDailyRitualBriefing/);
    expect(loaderSource).not.toMatch(/startDailyRitual/);
    expect(loaderSource).not.toMatch(/completeDailyRitual/);
    expect(loaderSource).not.toMatch(/generateMorningBrief/);
  });

  it("redirects successful login to /wake and gates bare root through /wake", () => {
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");

    expect(loginSource).toContain('redirect("/wake")');
    expect(loginSource).not.toContain('redirect("/")');
    expect(homeSource).toContain("loadCommandCenter");
    expect(homeSource).toContain('redirect("/wake")');
  });

  it("keeps Command Center and BriefingPlayer unchanged", () => {
    const briefingSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");

    expect(briefingSource).toContain("BriefingPlayer");
    expect(briefingSource).not.toContain("MorningRitualGate");
  });

  it("uses sanitized mutation responses without redirect or transcript leakage", () => {
    const startSource = readFileSync(START_ROUTE_PATH, "utf8");
    const completeSource = readFileSync(COMPLETE_ROUTE_PATH, "utf8");

    for (const source of [startSource, completeSource]) {
      expect(source).toContain('"Cache-Control": "private, no-store"');
      expect(source).not.toMatch(/redirect\("/);
      expect(source).not.toContain("transcript");
      expect(source).not.toContain("audio_content_hash");
      expect(source).not.toContain("signedUrl");
    }
  });
});
