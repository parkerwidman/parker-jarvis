import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const {
  createClientMock,
  loadMorningRitualEntryMock,
  loadCommandCenterMock,
  redirectMock,
  cookiesGetMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  loadMorningRitualEntryMock: vi.fn(),
  loadCommandCenterMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  cookiesGetMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookiesGetMock,
  })),
}));

vi.mock("@/lib/jarvis/rituals/load-morning-ritual-entry", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/jarvis/rituals/load-morning-ritual-entry")
    >();
  return {
    ...actual,
    loadMorningRitualEntry: loadMorningRitualEntryMock,
  };
});

vi.mock("@/lib/jarvis/dashboard/load-command-center", () => ({
  loadCommandCenter: loadCommandCenterMock,
}));

vi.mock("@/components/jarvis/jarvis-app-shell", () => ({
  JarvisAppShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/jarvis/command-center-context-layout", () => ({
  CommandCenterContextLayout: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@/components/jarvis/command-center/command-center-dashboard", () => ({
  CommandCenterDashboard: () => null,
}));

vi.mock("@/components/jarvis/ritual-entry-url-cleanup", () => ({
  RitualEntryUrlCleanup: () => null,
}));

import Home from "@/app/page";

const ROOT = resolve(import.meta.dirname, "..");
const HOME_PAGE_PATH = resolve(import.meta.dirname, "page.tsx");
const WAKE_PAGE_PATH = resolve(import.meta.dirname, "wake/page.tsx");
const LOGIN_ACTIONS_PATH = resolve(import.meta.dirname, "login/actions.ts");
const WELCOME_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/welcome-back-screen.tsx",
);
const FLOW_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-flow.tsx",
);
const WAKE_ACTIONS_PATH = resolve(import.meta.dirname, "wake/actions.ts");
const COMPLETE_ROUTE_PATH = resolve(
  import.meta.dirname,
  "api/rituals/morning/complete/route.ts",
);
const BYPASS_PATH = resolve(
  ROOT,
  "lib/jarvis/rituals/morning-ritual-bypass.ts",
);
const CLEANUP_PATH = resolve(
  ROOT,
  "components/jarvis/ritual-entry-url-cleanup.tsx",
);
const PROXY_PATH = resolve(ROOT, "proxy.ts");
const LOAD_ENTRY_PATH = resolve(
  ROOT,
  "lib/jarvis/rituals/load-morning-ritual-entry.ts",
);
const BRIEFING_PLAYER_PATH = resolve(
  ROOT,
  "components/jarvis/command-center/briefing-player.tsx",
);

function createEntry(
  overrides: Partial<MorningRitualEntry> = {},
): MorningRitualEntry {
  return {
    displayName: "Alex",
    timezone: "America/Chicago",
    ritualDate: "2026-08-07",
    ritualState: "full_required",
    ritualStatus: "not_started",
    briefingDate: null,
    briefing: null,
    playbackReadiness: "no_brief",
    ...overrides,
  };
}

const COMPLETED_ENTRY = createEntry({
  ritualState: "welcome_back",
  ritualStatus: "completed",
  briefingDate: "2026-08-07",
  playbackReadiness: "ready",
});

const STARTED_ENTRY = createEntry({
  ritualStatus: "started",
  briefingDate: "2026-08-07",
  playbackReadiness: "ready",
});

function mockAuthenticatedClient(options?: {
  userId?: string | null;
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
                  email: "owner@example.com",
                },
              },
        error: options?.authError ?? null,
      }),
    },
  });
}

function callHome(searchParams: { ritualEntry?: string } = {}) {
  return Home({ searchParams: Promise.resolve(searchParams) });
}

describe("Home daily entry gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedClient();
    cookiesGetMock.mockReturnValue(undefined);
    loadMorningRitualEntryMock.mockResolvedValue(COMPLETED_ENTRY);
    loadCommandCenterMock.mockResolvedValue({
      preferredName: "Alex",
      timezone: "America/Chicago",
    });
  });

  it("redirects unauthenticated bare / to /login", async () => {
    mockAuthenticatedClient({ userId: null });

    await expect(callHome()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(loadMorningRitualEntryMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated /?ritualEntry=complete to /login", async () => {
    mockAuthenticatedClient({ userId: null });

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(loadMorningRitualEntryMock).not.toHaveBeenCalled();
  });

  it("A: renders Command Center when no ritual and no same-day brief", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(createEntry());

    await callHome();

    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
    expect(loadCommandCenterMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("B: renders Command Center when no ritual and same-day audio_not_ready", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({ playbackReadiness: "audio_not_ready" }),
    );

    await callHome();

    expect(loadCommandCenterMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("C: renders Command Center when no ritual and same-day timeline_missing", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({ playbackReadiness: "timeline_missing" }),
    );

    await callHome();

    expect(loadCommandCenterMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("D: redirects bare / to /wake when no ritual and same-day ready", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({ playbackReadiness: "ready" }),
    );

    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("allows / when same-day bypass cookie matches ritual date", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({
        ritualDate: "2026-08-15",
        playbackReadiness: "ready",
      }),
    );
    cookiesGetMock.mockReturnValue({ value: "2026-08-15" });

    await callHome();

    expect(loadCommandCenterMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects / to /wake when bypass cookie is stale", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({
        ritualDate: "2026-08-15",
        playbackReadiness: "ready",
      }),
    );
    cookiesGetMock.mockReturnValue({ value: "2026-08-14" });

    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
  });

  it("E: renders Command Center when yesterday ready and today missing", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({
        ritualDate: "2026-08-08",
        playbackReadiness: "no_brief",
      }),
    );

    await callHome();

    expect(loadCommandCenterMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("F: redirects authenticated started bare / to /wake", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(STARTED_ENTRY);

    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("G: redirects authenticated completed bare / to /wake", async () => {
    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("keeps completed / on Command Center when same-day bypass matches", async () => {
    cookiesGetMock.mockReturnValue({ value: "2026-08-07" });

    await callHome();

    expect(loadCommandCenterMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("H: renders Command Center when completed and ritualEntry=complete", async () => {
    await callHome({ ritualEntry: "complete" });

    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
    expect(loadCommandCenterMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("I: redirects malformed completed bypass when briefing_date does not match ritual_date", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({
        ritualState: "full_required",
        ritualStatus: "not_started",
        ritualDate: "2026-08-08",
        briefingDate: null,
        playbackReadiness: "ready",
      }),
    );

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("redirects no-row forged bypass to /wake", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(createEntry());

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("redirects started forged bypass to /wake", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(STARTED_ENTRY);

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it.each(["1", "true", "completed", "COMPLETE"])(
    "rejects wrong marker ritualEntry=%s without bypass",
    async (value) => {
      loadMorningRitualEntryMock.mockResolvedValue(COMPLETED_ENTRY);

      await expect(callHome({ ritualEntry: value })).rejects.toThrow(
        "REDIRECT:/wake",
      );
      expect(loadCommandCenterMock).not.toHaveBeenCalled();
    },
  );

  it("redirects stale bypass when today has no completed row", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(createEntry());

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
  });

  it("uses loadMorningRitualEntry for timezone-aware today lookup on bypass", async () => {
    await callHome({ ritualEntry: "complete" });

    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
    expect(loadMorningRitualEntryMock).toHaveBeenCalledTimes(1);
  });

  it("redirects to /wake when entry lookup fails", async () => {
    loadMorningRitualEntryMock.mockRejectedValue(new Error("db unavailable"));

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("J: does not perform ritual mutations on GET /", async () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("loadMorningRitualEntry");
    expect(source).not.toMatch(/startDailyRitual/);
    expect(source).not.toMatch(/completeDailyRitual/);
    expect(source).not.toMatch(/bindDailyRitualBriefing/);
    expect(source).not.toMatch(/generateMorningBrief/);
    expect(source).not.toMatch(/generateMorningBriefAudio/);
  });
});

describe("Daily entry routing safety boundaries", () => {
  it("valid bypass retains loadCommandCenter for Command Center", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("loadCommandCenter");
    expect(source).toContain("CommandCenterDashboard");
    expect(source).toContain("shouldRedirectHomeToWake");
    expect(readFileSync(BYPASS_PATH, "utf8")).toContain('ritualEntry === "complete"');
  });

  it("validated bypass renders RitualEntryUrlCleanup", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("RitualEntryUrlCleanup");
  });

  it("URL cleanup uses history.replaceState with preserved state and not router navigation to /", () => {
    const cleanupSource = readFileSync(CLEANUP_PATH, "utf8");
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(cleanupSource).toContain("history.replaceState");
    expect(cleanupSource).toContain(
      "history.replaceState(window.history.state",
    );
    expect(cleanupSource).toContain("url.pathname");
    expect(cleanupSource).not.toContain("useRouter");
    expect(cleanupSource).not.toContain('push("/")');
    expect(cleanupSource).not.toContain('replace("/")');
    expect(homeSource).not.toContain("router.push");
    expect(homeSource).not.toContain("router.replace");
  });

  it("Enter Jarvis navigates to /?ritualEntry=complete", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");

    expect(flowSource).toContain('router.push("/?ritualEntry=complete")');
    expect(flowSource).not.toContain('router.push("/")');
  });

  it("Enter Jarvis still requires completion acknowledged and audio ended", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");

    expect(flowSource).toContain("shouldRevealEnterJarvis");
    expect(flowSource).toContain("completionAcknowledged");
    expect(flowSource).toContain("audioEnded");
  });

  it("completed /wake still renders Welcome Back", () => {
    const gatePath = resolve(
      ROOT,
      "components/jarvis/morning-ritual/morning-ritual-gate.tsx",
    );
    const gateSource = readFileSync(gatePath, "utf8");

    expect(gateSource).toContain("WelcomeBackScreenWithBackground");
    expect(gateSource).toContain('ritualState === "welcome_back"');
  });

  it("Welcome Back waits ~1900ms before navigating", () => {
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    expect(welcomeSource).toContain("WELCOME_BACK_FLASH_MS = 1900");
    expect(welcomeSource).toContain("setTimeout");
  });

  it("Welcome Back destination is /?ritualEntry=complete via replace", () => {
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    expect(welcomeSource).toContain('router.replace("/?ritualEntry=complete")');
    expect(welcomeSource).not.toContain('router.push("/")');
  });

  it("Welcome Back never fetches or plays audio", () => {
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    expect(welcomeSource).not.toContain("fetchMorningRitualSignedAudioUrl");
    expect(welcomeSource).not.toMatch(/new Audio/);
  });

  it("successful login redirects to /", () => {
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");

    expect(loginSource).toContain('redirect("/")');
    expect(loginSource).not.toContain('redirect("/wake")');
    expect(loginSource).toContain('redirect("/login?error=Could not sign in")');
  });

  it("Continue to Jarvis bypass does not mutate ritual completion", () => {
    const wakeActionsSource = readFileSync(WAKE_ACTIONS_PATH, "utf8");
    const flowSource = readFileSync(FLOW_PATH, "utf8");

    expect(wakeActionsSource).toContain("applyMorningRitualBypassCookie");
    expect(wakeActionsSource).not.toMatch(/completeDailyRitual/);
    expect(wakeActionsSource).not.toMatch(/completeMorningRitual/);
    expect(flowSource).toContain("continueToJarvisFromRitual");
    expect(flowSource).toContain('data-testid="continue-to-jarvis-button"');
    expect(flowSource).toContain("shouldRevealEnterJarvis");
    expect(readFileSync(COMPLETE_ROUTE_PATH, "utf8")).toContain(
      "applyMorningRitualBypassCookie",
    );
  });

  it("root routing respects daily bypass helper", () => {
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");
    const bypassSource = readFileSync(BYPASS_PATH, "utf8");

    expect(homeSource).toContain("shouldRedirectHomeToWake");
    expect(homeSource).toContain("MORNING_RITUAL_BYPASS_COOKIE");
    expect(bypassSource).toContain("isMorningRitualBypassActive");
  });

  it("/wake unauthenticated still redirects /login", () => {
    const wakeSource = readFileSync(WAKE_PAGE_PATH, "utf8");

    expect(wakeSource).toContain('redirect("/login")');
  });

  it("GET /wake performs no ritual mutation", () => {
    const wakeSource = readFileSync(WAKE_PAGE_PATH, "utf8");
    const loaderSource = readFileSync(LOAD_ENTRY_PATH, "utf8");

    expect(wakeSource).toContain("loadMorningRitualEntry");
    expect(wakeSource).not.toMatch(/startDailyRitual/);
    expect(wakeSource).not.toMatch(/completeDailyRitual/);
    expect(loaderSource).not.toMatch(/startDailyRitual/);
    expect(loaderSource).not.toMatch(/completeDailyRitual/);
  });

  it("proxy remains free of DB ritual routing", () => {
    const proxySource = readFileSync(PROXY_PATH, "utf8");

    expect(proxySource).not.toMatch(/getDailyRitual/);
    expect(proxySource).not.toMatch(/jarvis_daily_rituals/);
    expect(proxySource).not.toMatch(/ritualEntry/);
    expect(proxySource).not.toMatch(/\/wake/);
  });

  it("Command Center UI components unchanged", () => {
    const briefingSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");
    const dashboardPath = resolve(
      ROOT,
      "components/jarvis/command-center/command-center-dashboard.tsx",
    );
    const dashboardSource = readFileSync(dashboardPath, "utf8");

    expect(briefingSource).toContain("BriefingPlayer");
    expect(briefingSource).not.toContain("MorningRitualGate");
    expect(dashboardSource).toContain("CommandCenterDashboard");
    expect(dashboardSource).not.toContain("MorningRitualGate");
  });
});

describe("Midnight stale bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedClient();
    loadCommandCenterMock.mockResolvedValue({
      preferredName: "Alex",
      timezone: "America/Chicago",
    });
  });

  it("yesterday completed does not satisfy today when entry is not_started", async () => {
    loadMorningRitualEntryMock.mockResolvedValue(
      createEntry({
        ritualDate: "2026-08-08",
        playbackReadiness: "no_brief",
      }),
    );

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");

    expect(loadMorningRitualEntryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      email: "owner@example.com",
    });
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("uses configured timezone via loadMorningRitualEntry without browser date", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("loadMorningRitualEntry");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toMatch(/new Date\(\)/);
  });
});
