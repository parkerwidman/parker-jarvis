import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const {
  createClientMock,
  getDailyRitualMock,
  loadCommandCenterMock,
  redirectMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getDailyRitualMock: vi.fn(),
  loadCommandCenterMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/rituals/daily-ritual", () => ({
  getDailyRitual: getDailyRitualMock,
}));

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

const COMPLETED_RITUAL = {
  userId: USER_ID,
  ritualDate: "2026-08-07",
  timezone: "America/Chicago",
  status: "completed" as const,
  briefingDate: "2026-08-07",
  startedAt: "2026-08-07T12:00:00.000Z",
  completedAt: "2026-08-07T12:30:00.000Z",
  createdAt: "2026-08-07T12:00:00.000Z",
  updatedAt: "2026-08-07T12:30:00.000Z",
};

const STARTED_RITUAL = {
  ...COMPLETED_RITUAL,
  status: "started" as const,
  completedAt: null,
};

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
    getDailyRitualMock.mockResolvedValue(COMPLETED_RITUAL);
    loadCommandCenterMock.mockResolvedValue({
      preferredName: "Alex",
      timezone: "America/Chicago",
    });
  });

  it("redirects unauthenticated bare / to /login", async () => {
    mockAuthenticatedClient({ userId: null });

    await expect(callHome()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getDailyRitualMock).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated /?ritualEntry=complete to /login", async () => {
    mockAuthenticatedClient({ userId: null });

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getDailyRitualMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated no-row bare / to /wake", async () => {
    getDailyRitualMock.mockResolvedValue(null);

    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated started bare / to /wake", async () => {
    getDailyRitualMock.mockResolvedValue(STARTED_RITUAL);

    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated completed bare / to /wake", async () => {
    await expect(callHome()).rejects.toThrow("REDIRECT:/wake");
    expect(redirectMock).toHaveBeenCalledWith("/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("renders Command Center when completed and ritualEntry=complete", async () => {
    await callHome({ ritualEntry: "complete" });

    expect(getDailyRitualMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(loadCommandCenterMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects no-row forged bypass to /wake", async () => {
    getDailyRitualMock.mockResolvedValue(null);

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("redirects started forged bypass to /wake", async () => {
    getDailyRitualMock.mockResolvedValue(STARTED_RITUAL);

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it.each(["1", "true", "completed", "COMPLETE"])(
    "rejects wrong marker ritualEntry=%s",
    async (value) => {
      await expect(callHome({ ritualEntry: value })).rejects.toThrow(
        "REDIRECT:/wake",
      );
      expect(getDailyRitualMock).not.toHaveBeenCalled();
    },
  );

  it("redirects stale bypass when today has no completed row", async () => {
    getDailyRitualMock.mockResolvedValue(null);

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(getDailyRitualMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
  });

  it("uses getDailyRitual for timezone-aware today lookup on bypass", async () => {
    await callHome({ ritualEntry: "complete" });

    expect(getDailyRitualMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(getDailyRitualMock).toHaveBeenCalledTimes(1);
  });

  it("redirects to /wake when ritual lookup fails", async () => {
    getDailyRitualMock.mockRejectedValue(new Error("db unavailable"));

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("does not perform ritual mutations on GET /", async () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("getDailyRitual");
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
    expect(source).toContain('ritualEntry !== "complete"');
    expect(source).toContain('ritual?.status !== "completed"');
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

  it("successful login redirects to /wake", () => {
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");

    expect(loginSource).toContain('redirect("/wake")');
    expect(loginSource).not.toContain('redirect("/")');
    expect(loginSource).toContain('redirect("/login?error=Could not sign in")');
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

  it("yesterday completed does not satisfy today when getDailyRitual returns null", async () => {
    getDailyRitualMock.mockResolvedValue(null);

    await expect(
      callHome({ ritualEntry: "complete" }),
    ).rejects.toThrow("REDIRECT:/wake");

    expect(getDailyRitualMock).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(loadCommandCenterMock).not.toHaveBeenCalled();
  });

  it("uses configured timezone via getDailyRitual without browser date", () => {
    const source = readFileSync(HOME_PAGE_PATH, "utf8");

    expect(source).toContain("getDailyRitual");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toMatch(/new Date\(\)/);
  });
});
