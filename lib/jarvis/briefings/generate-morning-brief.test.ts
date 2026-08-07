import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

const { mockResponsesCreate, listOutlookInbox, listOutlookCalendar, mockGenerateMorningBriefAudio } = vi.hoisted(
  () => ({
    mockResponsesCreate: vi.fn(),
    listOutlookInbox: vi.fn(),
    listOutlookCalendar: vi.fn().mockResolvedValue({ success: true, events: [] }),
    mockGenerateMorningBriefAudio: vi.fn().mockResolvedValue({
      resultCode: "ready",
    }),
  }),
);

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();

  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: mockResponsesCreate,
      },
    })),
  };
});

vi.mock("@/lib/jarvis/tools/memory-tools", () => ({
  loadJarvisContext: vi.fn().mockResolvedValue({
    profile: {
      timezone: "America/Chicago",
      preferred_name: "Parker",
      communication_style: null,
      current_focus: null,
    },
    goals: [],
    memories: [],
    lifeAreas: [],
  }),
}));

vi.mock("@/lib/jarvis/projects/load-melusi-planning-snapshot", () => ({
  loadMelusiPlanningSnapshot: vi.fn().mockResolvedValue({
    activeProjects: [],
    projectNameByTaskId: {},
    projectUpdates: [],
  }),
}));

vi.mock("@/lib/jarvis/briefings/load-melusi-expense-brief-snapshot", () => ({
  loadMelusiExpenseBriefSnapshot: vi.fn().mockResolvedValue({
    success: false,
    errorCode: "snapshot_unavailable",
  }),
}));

vi.mock("@/lib/jarvis/briefings/load-finance-brief-snapshot", () => ({
  loadFinanceBriefSnapshot: vi.fn().mockResolvedValue({
    success: false,
    errorCode: "snapshot_unavailable",
  }),
}));

vi.mock("@/lib/jarvis/tools/microsoft-tools", () => ({
  listOutlookInbox,
  listOutlookCalendar,
}));

vi.mock("@/lib/jarvis/briefings/generate-morning-brief-audio", () => ({
  generateMorningBriefAudio: (...args: unknown[]) =>
    mockGenerateMorningBriefAudio(...args),
}));

import { loadJarvisContext } from "@/lib/jarvis/tools/memory-tools";
import { generateMorningBrief } from "@/lib/jarvis/briefings/generate-morning-brief";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_BRIEF =
  "Good morning, Parker. Your top priority is finishing the proposal before the investor sync.";

function buildResponse(
  overrides: Partial<OpenAI.Responses.Response> = {},
): OpenAI.Responses.Response {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    model: "gpt-5",
    output: [],
    parallel_tool_calls: true,
    tool_choice: "auto",
    tools: [],
    ...overrides,
  } as OpenAI.Responses.Response;
}

function createMockSupabase() {
  const completedUpdates: Array<Record<string, unknown>> = [];
  const failedUpdates: Array<Record<string, unknown>> = [];

  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const afterSecondEq = {
    maybeSingle,
    not: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    }),
  };
  const afterFirstEq = {
    eq: vi.fn().mockReturnValue(afterSecondEq),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "tasks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(afterFirstEq),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn((payload: Record<string, unknown>) => {
          if (payload.status === "completed") {
            completedUpdates.push(payload);
          }
          if (payload.status === "failed") {
            failedUpdates.push(payload);
          }

          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }),
      };
    }),
  } as unknown as SupabaseClient;

  return { supabase, completedUpdates, failedUpdates };
}

describe("generateMorningBrief OpenAI storage behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    listOutlookCalendar.mockResolvedValue({ success: true, events: [] });
    mockGenerateMorningBriefAudio.mockResolvedValue({ resultCode: "ready" });
  });

  it("does not load Outlook inbox during Morning Brief generation", async () => {
    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: SAMPLE_BRIEF,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase } = createMockSupabase();
    await generateMorningBrief(supabase, USER_ID);

    expect(listOutlookInbox).not.toHaveBeenCalled();
    expect(listOutlookCalendar).toHaveBeenCalled();
  });

  it("does not store incomplete partial text as a completed brief", async () => {
    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "Good morning Parker, partial brief",
        usage: {
          input_tokens: 100,
          output_tokens: 400,
          total_tokens: 500,
          output_tokens_details: { reasoning_tokens: 390 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(false);
    expect(completedUpdates).toHaveLength(0);
    expect(failedUpdates.length).toBeGreaterThan(0);
    expect(listOutlookInbox).not.toHaveBeenCalled();
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { effort: "minimal" },
        max_output_tokens: 1200,
        store: false,
      }),
    );
  });

  it("stores completed concise text normally", async () => {
    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: SAMPLE_BRIEF,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(true);
    expect(completedUpdates).toHaveLength(1);
    expect(completedUpdates[0]?.content).toBe(SAMPLE_BRIEF);
    expect(completedUpdates[0]?.source_counts).toMatchObject({
      emails: 0,
      briefDisplay: { priorityText: null },
    });
    expect(failedUpdates).toHaveLength(0);
  });

  it("stores briefDisplay.priorityText when the plan has a canonical priority", async () => {
    vi.mocked(loadJarvisContext).mockResolvedValueOnce({
      profile: {
        timezone: "America/Chicago",
        preferred_name: "Parker",
        communication_style: null,
        current_focus: "figure out retroactive withdrawal for last semester's classes",
      },
      goals: [],
      memories: [],
      lifeAreas: [],
    });

    const briefWithPriority =
      "Good morning, Parker. The main thing I'd focus on first is figure out retroactive withdrawal for last semester's classes.";

    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: briefWithPriority,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(true);
    expect(completedUpdates).toHaveLength(1);
    expect(completedUpdates[0]?.content).toBe(briefWithPriority);
    expect(completedUpdates[0]?.source_counts).toMatchObject({
      briefDisplay: {
        priorityText: "figure out retroactive withdrawal for last semester's classes",
      },
    });
    expect(failedUpdates).toHaveLength(0);
  });

  it("does not mark a brief completed when canonical priority text is missing", async () => {
    vi.mocked(loadJarvisContext).mockResolvedValueOnce({
      profile: {
        timezone: "America/Chicago",
        preferred_name: "Parker",
        communication_style: null,
        current_focus: "figure out retroactive withdrawal for last semester's classes",
      },
      goals: [],
      memories: [],
      lifeAreas: [],
    });

    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: "Good morning, Parker. Nothing urgent needs attention today.",
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(false);
    expect(completedUpdates).toHaveLength(0);
    expect(failedUpdates.length).toBeGreaterThan(0);
  });

  it("still succeeds when morning brief audio generation fails", async () => {
    mockGenerateMorningBriefAudio.mockResolvedValueOnce({
      resultCode: "tts_failed",
    });

    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: SAMPLE_BRIEF,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(true);
    expect(completedUpdates).toHaveLength(1);
    expect(failedUpdates).toHaveLength(0);
    expect(mockGenerateMorningBriefAudio).toHaveBeenCalledOnce();
  });

  it("still succeeds when morning brief audio generation throws unexpectedly", async () => {
    mockGenerateMorningBriefAudio.mockRejectedValueOnce(
      new Error("unexpected audio subsystem failure"),
    );

    mockResponsesCreate.mockResolvedValue(
      buildResponse({
        status: "completed",
        output_text: SAMPLE_BRIEF,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    const { supabase, completedUpdates, failedUpdates } = createMockSupabase();
    const result = await generateMorningBrief(supabase, USER_ID);

    expect(result.success).toBe(true);
    expect(completedUpdates).toHaveLength(1);
    expect(failedUpdates).toHaveLength(0);
    expect(mockGenerateMorningBriefAudio).toHaveBeenCalledOnce();
  });
});
