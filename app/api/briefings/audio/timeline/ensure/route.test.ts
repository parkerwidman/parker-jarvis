import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
  MORNING_BRIEF_TIMELINE_ERROR_CODES,
  type MorningBriefAudioTimeline,
} from "@/lib/jarvis/briefings/audio-timeline-types";

const { createClientMock, ensureMorningBriefAudioTimelineMock } = vi.hoisted(
  () => ({
    createClientMock: vi.fn(),
    ensureMorningBriefAudioTimelineMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/briefings/ensure-morning-brief-audio-timeline", () => ({
  ensureMorningBriefAudioTimeline: ensureMorningBriefAudioTimelineMock,
}));

import { POST } from "@/app/api/briefings/audio/timeline/ensure/route";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRIEFING_DATE = "2026-08-07";
const CONTENT_HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const STORAGE_PATH = `${USER_ID}/${BRIEFING_DATE}/${CONTENT_HASH}.mp3`;
const SIGNED_URL = "https://example.supabase.co/storage/v1/object/sign/test";
const TRANSCRIPT = "Good morning Parker. Here is your briefing.";

const TIMELINE: MorningBriefAudioTimeline = {
  version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
  sentences: [
    {
      index: 0,
      text: "Good morning Parker.",
      startMs: 0,
      endMs: 900,
    },
    {
      index: 1,
      text: "Here is your briefing.",
      startMs: 1000,
      endMs: 2400,
    },
  ],
};

type BriefingRow = {
  status: string;
  audio_status: string;
};

function buildRequest(body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/briefings/audio/timeline/ensure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
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

function mockCompletedReadyBriefing() {
  return mockAuthenticatedClient({
    briefingRow: {
      status: "completed",
      audio_status: "ready",
    },
  });
}

describe("POST /api/briefings/audio/timeline/ensure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMorningBriefAudioTimelineMock.mockResolvedValue({
      resultCode: "ready",
      timeline: TIMELINE,
      durationMs: 2400,
      contentHash: CONTENT_HASH,
      reused: false,
    });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is malformed", async () => {
    mockAuthenticatedClient();

    const response = await POST(
      new NextRequest(
        "http://localhost/api/briefings/audio/timeline/ensure",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{not-json",
        },
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is missing", async () => {
    mockAuthenticatedClient();

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("returns 400 when briefingDate is malformed", async () => {
    mockAuthenticatedClient();

    const response = await POST(
      buildRequest({ briefingDate: "2026-13-40" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("derives auth user only from claims and ignores client userId", async () => {
    const supabase = mockCompletedReadyBriefing();

    await POST(
      buildRequest({
        briefingDate: BRIEFING_DATE,
        userId: OTHER_USER_ID,
        transcript: TRANSCRIPT,
        audioHash: CONTENT_HASH,
        storagePath: STORAGE_PATH,
        signedUrl: SIGNED_URL,
      }),
    );

    expect(supabase.eqUserId).toHaveBeenCalledWith("user_id", USER_ID);
    expect(ensureMorningBriefAudioTimelineMock).toHaveBeenCalledWith({
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
    });
  });

  it("returns 404 when the owned briefing row is missing", async () => {
    mockAuthenticatedClient({ briefingRow: null });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the briefing is incomplete", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        status: "failed",
        audio_status: "ready",
      },
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("returns 409 when audio is not ready", async () => {
    mockAuthenticatedClient({
      briefingRow: {
        status: "completed",
        audio_status: "generating",
      },
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "audio_not_ready" });
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("calls ensureMorningBriefAudioTimeline for completed ready briefings", async () => {
    mockCompletedReadyBriefing();

    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(ensureMorningBriefAudioTimelineMock).toHaveBeenCalledWith({
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
    });
  });

  it("returns safe ready metadata without timeline payload", async () => {
    mockCompletedReadyBriefing();

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ready",
      reused: false,
      durationMs: 2400,
      sentenceCount: 2,
    });
  });

  it("surfaces reused=true safely", async () => {
    mockCompletedReadyBriefing();
    ensureMorningBriefAudioTimelineMock.mockResolvedValueOnce({
      resultCode: "ready",
      timeline: TIMELINE,
      durationMs: 2400,
      contentHash: CONTENT_HASH,
      reused: true,
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      reused: true,
      durationMs: 2400,
      sentenceCount: 2,
    });
  });

  it("surfaces sanitized timeline failures", async () => {
    mockCompletedReadyBriefing();
    ensureMorningBriefAudioTimelineMock.mockResolvedValueOnce({
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.transcriptionFailed,
      contentHash: CONTENT_HASH,
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "failed",
      error: MORNING_BRIEF_TIMELINE_ERROR_CODES.transcriptionFailed,
    });
    expect(JSON.stringify(body)).not.toContain(CONTENT_HASH);
    expect(JSON.stringify(body)).not.toContain(TRANSCRIPT);
  });

  it("returns safe 503 when ensureMorningBriefAudioTimeline throws", async () => {
    mockCompletedReadyBriefing();
    ensureMorningBriefAudioTimelineMock.mockRejectedValueOnce(
      new Error("raw whisper failure with transcript details"),
    );

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw whisper");
    expect(JSON.stringify(body)).not.toContain(TRANSCRIPT);
  });

  it("does not call ensureMorningBriefAudioTimeline before auth and ownership validation", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });
    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();

    mockAuthenticatedClient({ briefingRow: null });
    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();

    mockAuthenticatedClient({
      briefingRow: {
        status: "failed",
        audio_status: "ready",
      },
    });
    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();

    mockAuthenticatedClient({
      briefingRow: {
        status: "completed",
        audio_status: "pending",
      },
    });
    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("sets Cache-Control to private, no-store on every response", async () => {
    mockAuthenticatedClient({ userId: null, authError: new Error("no session") });

    const unauthorized = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    expect(unauthorized.headers.get("Cache-Control")).toBe("private, no-store");

    mockCompletedReadyBriefing();
    const ready = await POST(buildRequest({ briefingDate: BRIEFING_DATE }));
    expect(ready.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("never returns path, hash, transcript, or signed URL fields", async () => {
    mockCompletedReadyBriefing();
    ensureMorningBriefAudioTimelineMock.mockResolvedValueOnce({
      resultCode: "ready",
      timeline: TIMELINE,
      durationMs: 2400,
      contentHash: CONTENT_HASH,
      reused: false,
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain(STORAGE_PATH);
    expect(serialized).not.toContain(CONTENT_HASH);
    expect(serialized).not.toContain(TRANSCRIPT);
    expect(serialized).not.toContain(SIGNED_URL);
    expect(serialized).not.toContain("timeline");
    expect(serialized).not.toContain("sentences");
  });

  it("does not perform live timeline or remote calls", async () => {
    mockCompletedReadyBriefing();

    await POST(buildRequest({ briefingDate: BRIEFING_DATE }));

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(ensureMorningBriefAudioTimelineMock).toHaveBeenCalledTimes(1);
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
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw createClient");
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected getClaims failures", async () => {
    mockAuthenticatedClient({
      getClaimsThrows: new Error("raw getClaims failure details"),
    });

    const response = await POST(
      buildRequest({ briefingDate: BRIEFING_DATE }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw getClaims");
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
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
    expect(body).toEqual({ error: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("raw database");
    expect(ensureMorningBriefAudioTimelineMock).not.toHaveBeenCalled();
  });
});
