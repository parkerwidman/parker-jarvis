import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateMorningBriefMock, createAutomationClientMock } = vi.hoisted(
  () => ({
    generateMorningBriefMock: vi.fn(),
    createAutomationClientMock: vi.fn(),
  }),
);

vi.mock("@/lib/jarvis/briefings/generate-morning-brief", () => ({
  generateMorningBrief: generateMorningBriefMock,
}));

vi.mock("@/lib/supabase/automation", () => ({
  createAutomationClient: createAutomationClientMock,
}));

import { GET, maxDuration } from "@/app/api/cron/morning-brief/route";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const CRON_SECRET = "test-cron-secret-value";

const ENV_KEYS = ["CRON_SECRET", "JARVIS_OWNER_USER_ID"] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as EnvSnapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function buildRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/morning-brief", { headers });
}

describe("morning-brief cron route", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.JARVIS_OWNER_USER_ID = OWNER_ID;
    createAutomationClientMock.mockReturnValue({});
    generateMorningBriefMock.mockResolvedValue({
      success: true,
      briefingDate: "2026-08-07",
    });
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    vi.clearAllMocks();
  });

  it("preserves maxDuration=300 for serverless TTS headroom", () => {
    expect(maxDuration).toBe(300);
  });

  it("still succeeds when morning brief audio generation fails inside generateMorningBrief", async () => {
    generateMorningBriefMock.mockResolvedValueOnce({
      success: true,
      briefingDate: "2026-08-07",
    });

    const response = await GET(
      buildRequest(`Bearer ${CRON_SECRET}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: "completed",
      briefingDate: "2026-08-07",
    });
    expect(generateMorningBriefMock).toHaveBeenCalledWith({}, OWNER_ID);
  });
});
