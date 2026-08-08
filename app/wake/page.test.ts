import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_USER_ID = "99999999-9999-4999-8999-999999999999";

const {
  createClientMock,
  loadMorningRitualEntryMock,
  redirectMock,
  generateMorningBriefMock,
  generateMorningBriefAudioMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  loadMorningRitualEntryMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  generateMorningBriefMock: vi.fn(),
  generateMorningBriefAudioMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/rituals/load-morning-ritual-entry", () => ({
  loadMorningRitualEntry: loadMorningRitualEntryMock,
}));

vi.mock("@/lib/jarvis/briefings/generate-morning-brief", () => ({
  generateMorningBrief: generateMorningBriefMock,
}));

vi.mock("@/lib/jarvis/briefings/generate-morning-brief-audio", () => ({
  generateMorningBriefAudio: generateMorningBriefAudioMock,
}));

import WakePage from "@/app/wake/page";

const WAKE_PAGE_PATH = resolve(import.meta.dirname, "page.tsx");
const HOME_PAGE_PATH = resolve(import.meta.dirname, "../page.tsx");
const LOGIN_ACTIONS_PATH = resolve(import.meta.dirname, "../login/actions.ts");

function mockAuthenticatedClient(options?: {
  userId?: string | null;
  email?: string | null;
  authError?: Error | null;
}) {
  const userId = options?.userId === undefined ? USER_ID : options.userId;

  createClientMock.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data:
          userId === null
            ? null
            : {
                claims: {
                  sub: userId,
                  email: options?.email ?? "owner@example.com",
                },
              },
        error: options?.authError ?? null,
      }),
    },
  });
}

describe("WakePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMorningRitualEntryMock.mockResolvedValue({
      displayName: "Alex",
      timezone: "America/Chicago",
      ritualDate: "2026-08-07",
      ritualState: "full_required",
      ritualStatus: "not_started",
      briefingDate: null,
      briefing: null,
      playbackReadiness: "no_brief",
    });
  });

  it("redirects unauthenticated visitors to /login", async () => {
    mockAuthenticatedClient({ userId: null });

    await expect(WakePage()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(loadMorningRitualEntryMock).not.toHaveBeenCalled();
  });

  it("uses authenticated claims identity for the loader", async () => {
    mockAuthenticatedClient({ userId: USER_ID, email: "owner@example.com" });

    await WakePage();

    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
  });

  it("does not accept a client-supplied userId from search params", () => {
    const source = readFileSync(WAKE_PAGE_PATH, "utf8");

    expect(source).not.toContain("searchParams");
    expect(source).not.toContain("CLIENT_USER_ID");
  });

  it("never calls morning brief generation or audio generation", async () => {
    mockAuthenticatedClient();

    await WakePage();

    expect(generateMorningBriefMock).not.toHaveBeenCalled();
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });
});

describe("Morning Ritual phase 2 safety boundaries", () => {
  it("redirects successful login to /wake", () => {
    const source = readFileSync(LOGIN_ACTIONS_PATH, "utf8");

    expect(source).toContain('redirect("/wake")');
    expect(source).not.toContain('redirect("/")');
  });

  it("gates root bare entry through playback readiness and ritual state", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("loadMorningRitualEntry");
    expect(source).toContain("resolveMorningRitualRootRoute");
    expect(source).toContain('redirect("/wake")');
    expect(source).toContain('redirect("/login")');
  });

  it("keeps Command Center components unchanged by this phase", () => {
    const dashboardPath = resolve(
      import.meta.dirname,
      "../../components/jarvis/command-center/command-center-dashboard.tsx",
    );
    const source = readFileSync(dashboardPath, "utf8");

    expect(source).toContain("CommandCenterDashboard");
    expect(source).not.toContain("MorningRitualGate");
    expect(source).not.toContain("/wake");
  });

  it("does not gate root / through wake without readiness or ritual state", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain('ritualEntry === "complete"');
    expect(source).toContain("resolveMorningRitualRootRoute");
    expect(source).toMatch(/redirect\("\/wake"\)/);
  });

  it("does not trust client-supplied userId in the wake route", () => {
    const source = readFileSync(WAKE_PAGE_PATH, "utf8");

    expect(source).toContain("authData.claims.sub");
    expect(source).not.toContain(CLIENT_USER_ID);
    expect(source).not.toMatch(/searchParams/);
  });
});
