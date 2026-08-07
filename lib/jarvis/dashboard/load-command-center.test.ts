import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jarvis/tools/microsoft-tools", () => ({
  listOutlookCalendar: vi.fn().mockResolvedValue({
    success: false,
    needsConnection: true,
  }),
  listOutlookInbox: vi.fn().mockResolvedValue({
    success: false,
    needsConnection: true,
  }),
}));

import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createThenableQuery<T>(result: T) {
  const chain: Record<string, unknown> = {};

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);

  chain.then = (
    onFulfilled: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  return chain;
}

function createSupabaseMock(briefingRow: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === "jarvis_profiles") {
        return createThenableQuery({
          data: {
            user_id: USER_ID,
            preferred_name: "Parker",
            timezone: "America/Chicago",
            current_focus: null,
          },
          error: null,
        });
      }

      if (table === "morning_briefings") {
        return createThenableQuery({
          data: briefingRow,
          error: null,
        });
      }

      if (table === "action_requests" && arguments.length === 0) {
        return createThenableQuery({
          data: [],
          error: null,
          count: 0,
        });
      }

      return createThenableQuery({
        data: [],
        error: null,
        count: 0,
      });
    }),
  };
}

describe("loadCommandCenter briefing audio metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes only safe audioStatus metadata on the briefing view model", async () => {
    const supabase = createSupabaseMock({
      id: "briefing-id",
      briefing_date: "2026-08-07",
      status: "completed",
      content: "Good morning.\n\nToday is focused.",
      safe_error_message: null,
      source_counts: null,
      audio_status: "ready",
      audio_generated_at: "2026-08-07T08:15:00.000Z",
      audio_storage_path: `${USER_ID}/2026-08-07/deadbeef.mp3`,
      audio_content_hash: "deadbeef".repeat(8),
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing).toEqual({
      id: "briefing-id",
      status: "completed",
      preview: "Good morning.\nToday is focused.",
      safeErrorMessage: null,
      audioStatus: "ready",
      audioGeneratedAt: "2026-08-07T08:15:00.000Z",
    });
    expect(JSON.stringify(data.briefing)).not.toContain("audio_storage_path");
    expect(JSON.stringify(data.briefing)).not.toContain("audio_content_hash");
    expect(JSON.stringify(data.briefing)).not.toContain("object/sign");
  });

  it("includes audioGeneratedAt as the only new safe audio version metadata", async () => {
    const supabase = createSupabaseMock({
      id: "briefing-id",
      briefing_date: "2026-08-07",
      status: "completed",
      content: "Brief text",
      safe_error_message: null,
      source_counts: null,
      audio_status: "ready",
      audio_generated_at: "2026-08-07T09:30:00.000Z",
      audio_storage_path: `${USER_ID}/2026-08-07/deadbeef.mp3`,
      audio_content_hash: "deadbeef".repeat(8),
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);
    const serialized = JSON.stringify(data.briefing);

    expect(data.briefing?.audioGeneratedAt).toBe("2026-08-07T09:30:00.000Z");
    expect(serialized).not.toContain("audio_storage_path");
    expect(serialized).not.toContain("audio_content_hash");
    expect(serialized).not.toContain("object/sign");
  });

  it("defaults unknown audio_status values to none", async () => {
    const supabase = createSupabaseMock({
      id: "briefing-id",
      briefing_date: "2026-08-07",
      status: "completed",
      content: "Brief text",
      safe_error_message: null,
      source_counts: null,
      audio_status: "unexpected",
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing?.audioStatus).toBe("none");
  });
});
