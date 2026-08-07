import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, generateMorningBriefAudioMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  generateMorningBriefAudioMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/briefings/generate-morning-brief-audio", () => ({
  generateMorningBriefAudio: generateMorningBriefAudioMock,
}));

import { POST } from "@/app/api/briefings/audio/retry/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRIEFING_DATE = "2026-08-07";
const STORED_CONTENT = "Good morning Parker. Here is your briefing.";

type BriefingRow = {
  content: string | null;
  status: string;
};

function buildRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/briefings/audio/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

describe("POST /api/briefings/audio/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateMorningBriefAudioMock.mockResolvedValue({
      resultCode: "ready",
    });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is missing", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is malformed", async () => {
    mockAuthenticatedClient();

    const response = await POST(
      buildRequest({ briefingDate: "2026-13-40" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });

  it("derives auth user only from claims and ignores client userId", async () => {
    const supabase = mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });

    await POST(
      buildRequest({
        briefingDate: BRIEFING_DATE,
        userId: OTHER_USER_ID,
        content: "client supplied text must be ignored",
        storagePath: "evil/path.mp3",
      }),
    );

    expect(supabase.eqUserId).toHaveBeenCalledWith("user_id", USER_ID);
    expect(generateMorningBriefAudioMock).toHaveBeenCalledWith({
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      normalizedSpokenContent: STORED_CONTENT,
    });
  });

  it("returns 404 when the briefing row is missing", async () => {
    mockAuthenticatedClient({ briefingRow: null });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });

  it("returns failed when stored text is missing or unsuccessful", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: null,
        status: "completed",
      },
    });

    const missingContent = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(missingContent.status).toBe(200);
    await expect(missingContent.json()).resolves.toEqual({ status: "failed" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();

    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "failed",
      },
    });

    const failedBrief = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(failedBrief.status).toBe(200);
    await expect(failedBrief.json()).resolves.toEqual({ status: "failed" });
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });

  it("passes stored authoritative content to generateMorningBriefAudio", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: `  ${STORED_CONTENT}  `,
        status: "completed",
      },
    });

    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(generateMorningBriefAudioMock).toHaveBeenCalledWith({
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      normalizedSpokenContent: STORED_CONTENT,
    });
  });

  it("maps already_ready to ready", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockResolvedValueOnce({
      resultCode: "already_ready",
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("maps ready to ready", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockResolvedValueOnce({
      resultCode: "ready",
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("maps generation_in_progress to generating", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockResolvedValueOnce({
      resultCode: "generation_in_progress",
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "generating" });
  });

  it("maps generation failures to failed", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockResolvedValueOnce({
      resultCode: "tts_failed",
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "failed" });
  });

  it("sanitizes unexpected generation throws", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockRejectedValueOnce(
      new Error("raw openai tts failure with transcript details"),
    );

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "failed" });
    expect(JSON.stringify(body)).not.toContain("raw openai");
    expect(JSON.stringify(body)).not.toContain(STORED_CONTENT);
  });

  it("never returns raw errors, content, or storage paths", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });
    generateMorningBriefAudioMock.mockResolvedValueOnce({
      resultCode: "ready",
      contentHash: "secret-hash-value",
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("secret-hash-value");
    expect(serialized).not.toContain(STORED_CONTENT);
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("tts_failed");
  });

  it("sets Cache-Control to private, no-store on all responses", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });

    const unauthorized = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    expect(unauthorized.headers.get("Cache-Control")).toBe("private, no-store");

    mockAuthenticatedClient({
      briefingRow: {
        content: STORED_CONTENT,
        status: "completed",
      },
    });

    const ready = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ready.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("sanitizes unexpected createClient failures", async () => {
    createClientMock.mockRejectedValueOnce(
      new Error("raw createClient failure details"),
    );

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "failed" });
    expect(JSON.stringify(body)).not.toContain("raw createClient");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns safe 503 when briefing lookup throws", async () => {
    mockAuthenticatedClient({
      lookupThrows: new Error("raw database network failure"),
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "failed" });
    expect(JSON.stringify(body)).not.toContain("raw database");
    expect(generateMorningBriefAudioMock).not.toHaveBeenCalled();
  });
});
