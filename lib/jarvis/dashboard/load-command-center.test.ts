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

import {
  loadCommandCenter,
  selectDisplayedMorningBriefingRow,
} from "@/lib/jarvis/dashboard/load-command-center";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createThenableQuery<T>(result: T) {
  const chain: Record<string, unknown> = {};

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);

  chain.then = (
    onFulfilled: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  return chain;
}

type BriefingRow = Record<string, unknown>;

function createSupabaseMock(options?: {
  todayBriefingRow?: BriefingRow | null;
  latestCompletedBriefingRow?: BriefingRow | null;
  briefingRow?: BriefingRow | null;
}) {
  const todayBriefingRow =
    options?.todayBriefingRow ??
    options?.briefingRow ??
    null;
  const latestCompletedBriefingRow =
    options?.latestCompletedBriefingRow ?? todayBriefingRow;

  let morningBriefingsQueryCount = 0;

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
        morningBriefingsQueryCount += 1;
        const row =
          morningBriefingsQueryCount === 1
            ? todayBriefingRow
            : latestCompletedBriefingRow;

        return createThenableQuery({
          data: row,
          error: null,
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

describe("selectDisplayedMorningBriefingRow", () => {
  it("prefers today's completed brief over an older completed brief", () => {
    const today = {
      id: "today",
      briefing_date: "2026-08-07",
      status: "completed",
      content: "Today brief",
    };
    const prior = {
      id: "prior",
      briefing_date: "2026-08-06",
      status: "completed",
      content: "Prior brief",
    };

    expect(selectDisplayedMorningBriefingRow(today, prior)).toBe(today);
  });

  it("falls back to the latest completed brief before today is ready", () => {
    const prior = {
      id: "prior",
      briefing_date: "2026-08-06",
      status: "completed",
      content: "Prior brief",
    };

    expect(
      selectDisplayedMorningBriefingRow(
        {
          id: "today",
          briefing_date: "2026-08-07",
          status: "generating",
          content: null,
        },
        prior,
      ),
    ).toBe(prior);
  });

  it("returns null when no briefing row exists", () => {
    expect(selectDisplayedMorningBriefingRow(null, null)).toBeNull();
  });
});

describe("loadCommandCenter briefing audio metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes only safe audioStatus metadata on the briefing view model", async () => {
    const supabase = createSupabaseMock({
      briefingRow: {
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
      },
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing).toEqual({
      id: "briefing-id",
      briefingDate: "2026-08-07",
      status: "completed",
      preview: "Good morning.\nToday is focused.",
      safeErrorMessage: null,
      audioStatus: "ready",
      audioGeneratedAt: "2026-08-07T08:15:00.000Z",
    });
    expect(JSON.stringify(data.briefing)).not.toContain("audio_storage_path");
    expect(JSON.stringify(data.briefing)).not.toContain("audio_content_hash");
    expect(JSON.stringify(data.briefing)).not.toContain("object/sign");
    expect(JSON.stringify(data.briefing)).not.toContain("userId");
  });

  it("includes audioGeneratedAt as the only new safe audio version metadata", async () => {
    const supabase = createSupabaseMock({
      briefingRow: {
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
      },
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
      briefingRow: {
        id: "briefing-id",
        briefing_date: "2026-08-07",
        status: "completed",
        content: "Brief text",
        safe_error_message: null,
        source_counts: null,
        audio_status: "unexpected",
      },
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing?.audioStatus).toBe("none");
  });

  it("uses the displayed prior brief date when today is not completed", async () => {
    const supabase = createSupabaseMock({
      todayBriefingRow: null,
      latestCompletedBriefingRow: {
        id: "prior-id",
        briefing_date: "2026-08-06",
        status: "completed",
        content: "Yesterday brief",
        safe_error_message: null,
        source_counts: null,
        audio_status: "none",
        audio_generated_at: null,
      },
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.todayDate).not.toBe("2026-08-06");
    expect(data.briefing?.briefingDate).toBe("2026-08-06");
    expect(data.briefingTranscript).toBe("Yesterday brief");
    expect(data.briefing?.audioStatus).toBe("none");
    expect(data.briefing?.audioGeneratedAt).toBeNull();
  });

  it("keeps transcript, audio metadata, and briefingDate on the same displayed row", async () => {
    const supabase = createSupabaseMock({
      todayBriefingRow: {
        id: "today-id",
        briefing_date: "2026-08-07",
        status: "generating",
        content: null,
        safe_error_message: null,
        source_counts: null,
        audio_status: "none",
        audio_generated_at: null,
      },
      latestCompletedBriefingRow: {
        id: "prior-id",
        briefing_date: "2026-08-06",
        status: "completed",
        content: "Prior brief text",
        safe_error_message: null,
        source_counts: null,
        audio_status: "none",
        audio_generated_at: null,
      },
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing?.id).toBe("prior-id");
    expect(data.briefing?.briefingDate).toBe("2026-08-06");
    expect(data.briefingTranscript).toBe("Prior brief text");
    expect(data.briefing?.audioStatus).toBe("none");
  });

  it("does not fabricate briefing metadata when no briefing row exists", async () => {
    const supabase = createSupabaseMock({
      todayBriefingRow: null,
      latestCompletedBriefingRow: null,
    });

    const data = await loadCommandCenter(supabase as never, USER_ID);

    expect(data.briefing).toBeNull();
    expect(data.briefingTranscript).toBeNull();
  });
});
