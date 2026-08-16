import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMorningRitualBypassCookieOptions,
  MORNING_RITUAL_BYPASS_COOKIE,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";

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

  it("sets the same-day bypass cookie after successful completion", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    const bypassCookie = response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE);
    const expectedOptions = getMorningRitualBypassCookieOptions();
    const setCookieHeader = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(bypassCookie?.value).toBe("2026-08-07");
    expect(bypassCookie?.path).toBe(expectedOptions.path);
    expect(bypassCookie?.httpOnly).toBe(expectedOptions.httpOnly);
    expect(bypassCookie?.sameSite).toBe(expectedOptions.sameSite);
    expect(bypassCookie?.maxAge).toBe(expectedOptions.maxAge);
    expect(setCookieHeader).toContain(
      `${MORNING_RITUAL_BYPASS_COOKIE}=2026-08-07`,
    );
  });

  it("sets the same-day bypass cookie when the ritual is already completed", async () => {
    mockAuthenticatedClient();
    completeMorningRitualMock.mockResolvedValue({
      success: true,
      result: "already_completed",
      ritual: {
        ritualDate: "2026-08-07",
        timezone: "America/Chicago",
        status: "completed",
        briefingDate: BRIEFING_DATE,
        startedAt: "2026-08-07T08:00:00.000Z",
        completedAt: "2026-08-07T08:30:00.000Z",
      },
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE)?.value).toBe(
      "2026-08-07",
    );
  });

  it("does not set a bypass cookie when completion fails", async () => {
    mockAuthenticatedClient();
    completeMorningRitualMock.mockResolvedValue({
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    });

    const response = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(404);
    expect(response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE)).toBeUndefined();
  });
});
