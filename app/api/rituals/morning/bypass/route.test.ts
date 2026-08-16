import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMorningRitualBypassCookieOptions,
  MORNING_RITUAL_BYPASS_COOKIE,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST } from "@/app/api/rituals/morning/bypass/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function buildRequest(ritualDate?: string): NextRequest {
  const formData = new FormData();

  if (ritualDate !== undefined) {
    formData.set("ritualDate", ritualDate);
  }

  return new NextRequest("http://localhost/api/rituals/morning/bypass", {
    method: "POST",
    body: formData,
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

describe("POST /api/rituals/morning/bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the bypass cookie on the redirect response before completion", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest("2026-08-15"));
    const bypassCookie = response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE);
    const expectedOptions = getMorningRitualBypassCookieOptions();
    const setCookieHeader = response.headers.get("set-cookie");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/");
    expect(bypassCookie?.value).toBe("2026-08-15");
    expect(bypassCookie?.path).toBe(expectedOptions.path);
    expect(bypassCookie?.httpOnly).toBe(expectedOptions.httpOnly);
    expect(bypassCookie?.sameSite).toBe(expectedOptions.sameSite);
    expect(bypassCookie?.maxAge).toBe(expectedOptions.maxAge);
    expect(setCookieHeader).toContain(
      `${MORNING_RITUAL_BYPASS_COOKIE}=2026-08-15`,
    );
  });

  it("redirects invalid ritual dates to /wake without setting a cookie", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest("invalid-date"));

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/wake");
    expect(response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE)).toBeUndefined();
  });

  it("redirects unauthenticated requests to /login without setting a cookie", async () => {
    mockAuthenticatedClient({ userId: null });

    const response = await POST(buildRequest("2026-08-15"));

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost/login");
    expect(response.cookies.get(MORNING_RITUAL_BYPASS_COOKIE)).toBeUndefined();
  });
});
