import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, completeMorningRitualMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  completeMorningRitualMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/rituals/morning-ritual-service", () => ({
  completeMorningRitual: completeMorningRitualMock,
}));

import { POST } from "@/app/api/rituals/morning/complete/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRIEFING_DATE = "2026-08-07";

function buildRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/rituals/morning/complete", {
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

describe("POST /api/rituals/morning/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeMorningRitualMock.mockResolvedValue({
      success: true,
      result: "completed",
      ritual: {
        ritualDate: "2026-08-07",
        timezone: "America/Chicago",
        status: "completed",
        briefingDate: BRIEFING_DATE,
        startedAt: "2026-08-07T08:00:00.000Z",
        completedAt: "2026-08-07T08:30:00.000Z",
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticatedClient({ userId: null });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(401);
    expect(completeMorningRitualMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the ritual has not been started", async () => {
    mockAuthenticatedClient();
    completeMorningRitualMock.mockResolvedValue({
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_started" });
  });

  it("returns 409 when the bound briefing date does not match", async () => {
    mockAuthenticatedClient();
    completeMorningRitualMock.mockResolvedValue({
      success: false,
      error: "Daily ritual is bound to a different briefing.",
      code: "briefing_mismatch",
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "briefing_mismatch" });
  });

  it("returns private no-store completion state without redirect semantics", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.result).toBe("completed");
    expect(body).not.toHaveProperty("redirect");
    expect(body.ritual).not.toHaveProperty("userId");
  });
});
