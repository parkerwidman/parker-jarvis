import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, startMorningRitualMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  startMorningRitualMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/rituals/morning-ritual-service", () => ({
  startMorningRitual: startMorningRitualMock,
}));

import { POST } from "@/app/api/rituals/morning/start/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRIEFING_DATE = "2026-08-07";

function buildRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/rituals/morning/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

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
                },
              },
        error: options?.authError ?? null,
      }),
    },
  });
}

describe("POST /api/rituals/morning/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startMorningRitualMock.mockResolvedValue({
      success: true,
      result: "started",
      ritual: {
        ritualDate: "2026-08-07",
        timezone: "America/Chicago",
        status: "started",
        briefingDate: BRIEFING_DATE,
        startedAt: "2026-08-07T08:00:00.000Z",
        completedAt: null,
      },
      created: true,
      bound: true,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticatedClient({ userId: null });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(401);
    expect(startMorningRitualMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed briefing dates", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({ briefingDate: "08/07/2026" }));

    expect(response.status).toBe(400);
    expect(startMorningRitualMock).not.toHaveBeenCalled();
  });

  it("uses authenticated claims identity and returns private no-store responses", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(startMorningRitualMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
    });
    expect(body.result).toBe("started");
    expect(body.ritual.briefingDate).toBe(BRIEFING_DATE);
    expect(body.ritual).not.toHaveProperty("userId");
  });

  it("maps briefing_not_ready to 409", async () => {
    mockAuthenticatedClient();
    startMorningRitualMock.mockResolvedValue({
      success: false,
      error: "Morning briefing is not ready for ritual playback.",
      code: "briefing_not_ready",
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "briefing_not_ready" });
  });

  it("maps briefing_mismatch to 409", async () => {
    mockAuthenticatedClient();
    startMorningRitualMock.mockResolvedValue({
      success: false,
      error: "Daily ritual is already bound to a different briefing.",
      code: "briefing_mismatch",
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "briefing_mismatch" });
  });
});
