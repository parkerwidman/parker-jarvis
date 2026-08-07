import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createAutomationClientMock,
  createSignedUrlMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAutomationClientMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/automation", () => ({
  createAutomationClient: createAutomationClientMock,
}));

import {
  GET,
  MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
} from "@/app/api/briefings/audio/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRIEFING_DATE = "2026-08-07";
const CONTENT_HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const STORAGE_PATH = `${USER_ID}/${BRIEFING_DATE}/${CONTENT_HASH}.mp3`;
const SIGNED_URL = "https://example.supabase.co/storage/v1/object/sign/test";

type BriefingRow = {
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
};

function buildRequest(query?: Record<string, string>): NextRequest {
  const params = new URLSearchParams(query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return new NextRequest(`http://localhost/api/briefings/audio${suffix}`);
}

function mockAuthenticatedClient(options?: {
  userId?: string | null;
  authError?: Error | null;
  getClaimsThrows?: Error;
  briefingRow?: BriefingRow | null;
  lookupError?: Error | null;
  lookupThrows?: Error;
}) {
  const userId = options?.userId === undefined ? USER_ID : options.userId;
  const maybeSingle = options?.lookupThrows
    ? vi.fn().mockRejectedValue(options.lookupThrows)
    : vi.fn().mockResolvedValue({
        data: options?.briefingRow ?? null,
        error: options?.lookupError ?? null,
      });
  const eqBriefingDate = vi.fn().mockReturnValue({ maybeSingle });
  const eqUserId = vi.fn().mockReturnValue({ eq: eqBriefingDate });
  const select = vi.fn().mockReturnValue({ eq: eqUserId });
  const from = vi.fn().mockReturnValue({ select });

  const getClaims = options?.getClaimsThrows
    ? vi.fn().mockRejectedValue(options.getClaimsThrows)
    : vi.fn().mockResolvedValue({
        data:
          userId === null
            ? null
            : {
                claims: {
                  sub: userId,
                },
              },
        error: options?.authError ?? null,
      });

  createClientMock.mockResolvedValue({
    auth: { getClaims },
    from,
  });

  return { from, eqUserId, eqBriefingDate, maybeSingle, getClaims };
}

describe("GET /api/briefings/audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: SIGNED_URL },
      error: null,
    });
    createAutomationClientMock.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: createSignedUrlMock,
        }),
      },
    });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is missing", async () => {
    mockAuthenticatedClient();

    const response = await GET(buildRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is malformed", async () => {
    mockAuthenticatedClient();

    const response = await GET(
      buildRequest({ briefingDate: "2026-13-40" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("looks up the briefing through the authenticated server client", async () => {
    const supabase = mockAuthenticatedClient({
      briefingRow: {
        audio_status: "none",
        audio_content_hash: null,
        audio_storage_path: null,
      },
    });

    await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(supabase.from).toHaveBeenCalledWith("morning_briefings");
    expect(supabase.eqUserId).toHaveBeenCalledWith("user_id", USER_ID);
    expect(supabase.eqBriefingDate).toHaveBeenCalledWith(
      "briefing_date",
      BRIEFING_DATE,
    );
  });

  it("returns 404 when the briefing row is missing", async () => {
    mockAuthenticatedClient({ briefingRow: null });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns unavailable for audio_status none without signing", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "none",
        audio_content_hash: null,
        audio_storage_path: null,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns generating for audio_status pending without signing", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "pending",
        audio_content_hash: null,
        audio_storage_path: null,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "generating" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns generating for audio_status generating without signing", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "generating",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: null,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "generating" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns failed for audio_status failed without signing", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "failed",
        audio_content_hash: null,
        audio_storage_path: null,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "failed" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns a signed URL when ready metadata is valid", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      url: SIGNED_URL,
      expiresInSeconds: MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
    });
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      STORAGE_PATH,
      MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
    );
  });

  it("uses a 90 second signed URL TTL", async () => {
    expect(MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS).toBe(90);
  });

  it("never returns audio_storage_path in the response body", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("audio_storage_path");
    expect(JSON.stringify(body)).not.toContain(STORAGE_PATH);
  });

  it("ignores client-provided userId and signs for the authenticated user", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });

    await GET(
      buildRequest({
        briefingDate: BRIEFING_DATE,
        userId: OTHER_USER_ID,
      }),
    );

    expect(createSignedUrlMock).toHaveBeenCalledWith(
      STORAGE_PATH,
      MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
    );
  });

  it("does not sign when content hash is malformed", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: "not-a-valid-hash",
        audio_storage_path: STORAGE_PATH,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("does not sign when storage path belongs to another user", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: `${OTHER_USER_ID}/${BRIEFING_DATE}/${CONTENT_HASH}.mp3`,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("does not sign when storage path hash does not match content hash", async () => {
    const mismatchedHash =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: `${USER_ID}/${BRIEFING_DATE}/${mismatchedHash}.mp3`,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns a safe generic response when signing fails", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });
    createSignedUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: "raw supabase signing failure details" },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw supabase");
  });

  it("sets Cache-Control to private, no-store", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "none",
        audio_content_hash: null,
        audio_storage_path: null,
      },
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("sanitizes unexpected createClient failures", async () => {
    createClientMock.mockRejectedValueOnce(
      new Error("raw createClient failure details"),
    );

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw createClient");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected getClaims failures", async () => {
    mockAuthenticatedClient({
      getClaimsThrows: new Error("raw getClaims failure details"),
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw getClaims");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("returns safe 503 when briefing lookup throws", async () => {
    mockAuthenticatedClient({
      lookupThrows: new Error("raw database network failure"),
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw database");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createAutomationClientMock).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected createAutomationClient failures", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });
    createAutomationClientMock.mockImplementationOnce(() => {
      throw new Error("raw automation client failure details");
    });

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw automation");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns safe 503 when createSignedUrl throws", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        audio_status: "ready",
        audio_content_hash: CONTENT_HASH,
        audio_storage_path: STORAGE_PATH,
      },
    });
    createSignedUrlMock.mockRejectedValueOnce(
      new Error("raw signed url network failure"),
    );

    const response = await GET(buildRequest({ briefingDate: BRIEFING_DATE }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw signed url");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
