import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MELUSI_JARVIS_AGENT,
} from "@/lib/jarvis/agents/agent-registry";
import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import {
  MAIN_JARVIS_TOOLS,
  MELUSI_JARVIS_TOOLS,
} from "@/lib/jarvis/agents/tool-definitions";
import { logToolCallDiagnostic } from "@/lib/jarvis/agents/agent-diagnostics";
import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_TASK,
  REGISTERED_ACTION_TYPES,
} from "@/lib/jarvis/action-requests/action-type-constants";
import {
  buildRegisteredActionPreview,
  executeRegisteredAction,
  getRegisteredExecutor,
  isFinanceOrPlaidWriteAction,
  validateRegisteredPayload,
} from "@/lib/jarvis/action-requests/action-executor-registry";
import { bindSupabaseToExecutionContext } from "@/lib/jarvis/action-requests/action-executor-registry";
import { executeApprovedActionRequest } from "@/lib/jarvis/action-requests/approval-execution";
import { stableStringifyPayload } from "@/lib/jarvis/action-requests/action-request-dedup";
import { validateCalendarEventPayload } from "@/lib/jarvis/action-requests/calendar-action-payload";
import { validateTaskPayload } from "@/lib/jarvis/action-requests/task-action-payload";
import { proposeTask } from "@/lib/jarvis/tools/action-request-tools";
import { createTask } from "@/lib/jarvis/tools/task-tools";
import { createOutlookCalendarEvent } from "@/lib/jarvis/tools/microsoft-tools";

vi.mock("@/lib/jarvis/tools/task-tools", () => ({
  createTask: vi.fn(),
}));

vi.mock("@/lib/jarvis/tools/microsoft-tools", () => ({
  createOutlookCalendarEvent: vi.fn(),
}));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

const VALID_TASK_PAYLOAD = {
  title: "Review quarterly report",
  description: "Check numbers",
  priority: "high",
  dueDate: "2026-08-15",
  context: "Finance review",
};

const VALID_CALENDAR_PAYLOAD = {
  subject: "Team sync",
  startDateTime: "2026-08-07T15:00:00-05:00",
  endDateTime: "2026-08-07T16:00:00-05:00",
  timeZone: "America/Chicago",
  locationName: null,
  notes: null,
};

function buildActionRequestSupabase(options: {
  loadData?: Record<string, unknown> | null;
  claimData?: Record<string, unknown> | null;
  onUpdate?: (payload: Record<string, unknown>) => void;
}) {
  const maybeSingleLoad = vi.fn().mockResolvedValue({
    data: options.loadData ?? null,
    error: null,
  });
  const maybeSingleClaim = vi.fn().mockResolvedValue({
    data: options.claimData ?? null,
    error: null,
  });

  const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    options.onUpdate?.(payload);
    const chain = {
      eq: vi.fn().mockImplementation(() => chain),
      select: vi.fn().mockReturnValue({ maybeSingle: maybeSingleClaim }),
    };
    return chain;
  });

  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleLoad }),
        }),
      }),
      update,
    })),
    update,
    maybeSingleClaim,
  };
}

describe("approval-gated task creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers direct create_task on main Jarvis", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).toContain("create_task");
  });

  it("does not register propose_task on main Jarvis", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("propose_task");
  });

  it("keeps Melusi task registration unchanged", () => {
    const melusiToolNames = MELUSI_JARVIS_TOOLS.map((tool) => tool.name);
    expect(melusiToolNames).toContain("create_task");
    expect(melusiToolNames).toContain("list_tasks");
    expect(melusiToolNames).toContain("complete_task");
    expect(MELUSI_JARVIS_AGENT.toolGroups).toEqual([
      "tasks",
      "projects",
      "melusi_social",
      "melusi_expenses",
    ]);
  });

  it("does not register propose_task on Melusi or other specialists", () => {
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("propose_task");
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain(
      "create_outlook_reminder",
    );
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("send_outlook_email");
  });

  it("creates one pending action_request for a valid proposal", async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            status: "pending",
            title: "Create task",
            summary: "Review quarterly report",
            expires_at: "2026-08-07T12:00:00.000Z",
          },
          error: null,
        }),
      }),
    });

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert,
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const result = await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("pending");
      expect(result.approvalRequired).toBe(true);
    }
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does not create a task during proposal", async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        status: "pending",
        title: "Create task",
        summary: "Review quarterly report",
        expires_at: "2026-08-07T12:00:00.000Z",
      },
      error: null,
    });

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: insertSingle }),
        }),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects malformed task payloads", () => {
    const result = validateTaskPayload({ title: "", priority: "high" });
    expect(result.success).toBe(false);
  });

  it("deduplicates duplicate pending proposals", async () => {
    const existing = {
      status: "pending",
      title: "Create task",
      summary: "Review quarterly report",
      expires_at: "2026-08-07T12:00:00.000Z",
      payload: VALID_TASK_PAYLOAD,
    };
    const insert = vi.fn();

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert,
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [existing], error: null }),
      })),
    };

    const result = await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("pending");
      expect(result.message).toContain("already waiting");
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns pending approval-required proposal results", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: "pending",
                title: "Create task",
                summary: "Review quarterly report",
                expires_at: "2026-08-07T12:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const result = await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);
    expect(result).toMatchObject({
      success: true,
      status: "pending",
      approvalRequired: true,
    });
  });

  it("does not claim completion in proposal results", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: "pending",
                title: "Create task",
                summary: "Review quarterly report",
                expires_at: "2026-08-07T12:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const result = await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);
    expect(JSON.stringify(result)).not.toContain("completed");
    if (result.success) {
      expect(result.message).not.toMatch(/created the task/i);
    }
  });

  it("creates exactly one task on approval execution", async () => {
    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "task-id-hidden",
        title: VALID_TASK_PAYLOAD.title,
        status: "todo",
        priority: "high",
        due_at: "2026-08-15T12:00:00.000Z",
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const context = bindSupabaseToExecutionContext(
      { actionRequestId: REQUEST_ID, userId: USER_A },
      {} as never,
    );

    const result = await executeRegisteredAction(
      ACTION_TYPE_CREATE_TASK,
      VALID_TASK_PAYLOAD,
      context,
    );

    expect(result.success).toBe(true);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("revalidates stored payload fully at execution", async () => {
    const invalidExecution = await executeRegisteredAction(
      ACTION_TYPE_CREATE_TASK,
      { title: "", priority: "high" },
      bindSupabaseToExecutionContext(
        { actionRequestId: REQUEST_ID, userId: USER_A },
        {} as never,
      ),
    );

    expect(invalidExecution.success).toBe(false);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("maps approved task fields from immutable payload", async () => {
    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "hidden",
        title: VALID_TASK_PAYLOAD.title,
        status: "todo",
        priority: "high",
        due_at: "2026-08-15T12:00:00.000Z",
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const result = await executeRegisteredAction(
      ACTION_TYPE_CREATE_TASK,
      VALID_TASK_PAYLOAD,
      bindSupabaseToExecutionContext(
        { actionRequestId: REQUEST_ID, userId: USER_A },
        {} as never,
      ),
    );

    expect(createTask).toHaveBeenCalledWith(expect.anything(), USER_A, {
      title: VALID_TASK_PAYLOAD.title,
      priority: VALID_TASK_PAYLOAD.priority,
      dueDate: VALID_TASK_PAYLOAD.dueDate,
      notes: `${VALID_TASK_PAYLOAD.description}\n\nContext: ${VALID_TASK_PAYLOAD.context}`,
    });

    if (result.success) {
      expect(result.safeResult).toMatchObject({
        title: VALID_TASK_PAYLOAD.title,
        dueDate: VALID_TASK_PAYLOAD.dueDate,
      });
    }
  });

  it("allows only one concurrent approval execution", async () => {
    let claimCount = 0;
    const supabase = buildActionRequestSupabase({
      loadData: {
        id: REQUEST_ID,
        user_id: USER_A,
        action_type: ACTION_TYPE_CREATE_TASK,
        status: "pending",
        payload: VALID_TASK_PAYLOAD,
        expires_at: "2099-01-01T00:00:00.000Z",
      },
      claimData: { id: REQUEST_ID },
    });

    supabase.maybeSingleClaim.mockImplementation(async () => {
      claimCount += 1;
      return claimCount === 1
        ? { data: { id: REQUEST_ID }, error: null }
        : { data: null, error: null };
    });

    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "hidden",
        title: VALID_TASK_PAYLOAD.title,
        status: "todo",
        priority: "high",
        due_at: null,
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const [first, second] = await Promise.all([
      executeApprovedActionRequest(supabase as never, USER_A, REQUEST_ID),
      executeApprovedActionRequest(supabase as never, USER_A, REQUEST_ID),
    ]);

    expect(claimCount).toBe(2);
    expect([first.success, second.success].filter(Boolean)).toHaveLength(1);
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it("does not execute repeated approval after completion", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: REQUEST_ID,
            user_id: USER_A,
            action_type: ACTION_TYPE_CREATE_TASK,
            status: "completed",
            payload: VALID_TASK_PAYLOAD,
            expires_at: "2099-01-01T00:00:00.000Z",
          },
          error: null,
        }),
      })),
    };

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_A,
      REQUEST_ID,
    );

    expect(result).toEqual({ success: false, errorCode: "approval_not_pending" });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("does not execute rejected requests", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: REQUEST_ID,
            user_id: USER_A,
            action_type: ACTION_TYPE_CREATE_TASK,
            status: "rejected",
            payload: VALID_TASK_PAYLOAD,
            expires_at: "2099-01-01T00:00:00.000Z",
          },
          error: null,
        }),
      })),
    };

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_A,
      REQUEST_ID,
    );

    expect(result.errorCode).toBe("approval_not_pending");
  });

  it("does not execute expired requests", async () => {
    const supabase = buildActionRequestSupabase({
      loadData: {
        id: REQUEST_ID,
        user_id: USER_A,
        action_type: ACTION_TYPE_CREATE_TASK,
        status: "pending",
        payload: VALID_TASK_PAYLOAD,
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    });

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_A,
      REQUEST_ID,
    );

    expect(result.errorCode).toBe("approval_expired");
    expect(supabase.update).toHaveBeenCalledWith({ status: "expired" });
  });

  it("does not re-execute failed requests", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: REQUEST_ID,
            user_id: USER_A,
            action_type: ACTION_TYPE_CREATE_TASK,
            status: "failed",
            payload: VALID_TASK_PAYLOAD,
            expires_at: "2099-01-01T00:00:00.000Z",
          },
          error: null,
        }),
      })),
    };

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_A,
      REQUEST_ID,
    );

    expect(result.errorCode).toBe("approval_not_pending");
  });

  it("blocks wrong-user request access", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_B,
      REQUEST_ID,
    );

    expect(result.errorCode).toBe("unauthorized");
  });

  it("never trusts browser-supplied action type or payload", async () => {
    const executor = getRegisteredExecutor(ACTION_TYPE_CREATE_TASK);
    expect(executor).not.toBeNull();

    const validated = validateRegisteredPayload(ACTION_TYPE_CREATE_TASK, {
      title: "Injected",
      priority: "low",
    });

    expect(validated.success).toBe(true);
    expect(validateRegisteredPayload("create_finance_transfer", {})).toEqual({
      success: false,
      errorCode: "action_unavailable",
    });
  });

  it("protects immutable proposal fields in migration", () => {
    const migration = require("node:fs").readFileSync(
      "supabase/migrations/20260806130000_add_task_creation_action_request.sql",
      "utf8",
    );

    expect(migration).toContain("prevent_action_request_immutable_updates");
    expect(migration).toContain("payload is immutable");
    expect(migration).toContain("create_task");
  });

  it("stores completed timestamps and safe result metadata", async () => {
    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "hidden",
        title: VALID_TASK_PAYLOAD.title,
        status: "todo",
        priority: "high",
        due_at: null,
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const updates: Record<string, unknown>[] = [];
    const supabase = buildActionRequestSupabase({
      loadData: {
        id: REQUEST_ID,
        user_id: USER_A,
        action_type: ACTION_TYPE_CREATE_TASK,
        status: "pending",
        payload: VALID_TASK_PAYLOAD,
        expires_at: "2099-01-01T00:00:00.000Z",
      },
      claimData: { id: REQUEST_ID },
      onUpdate: (payload) => {
        updates.push(payload);
      },
    });

    const result = await executeApprovedActionRequest(
      supabase as never,
      USER_A,
      REQUEST_ID,
    );

    expect(result.success).toBe(true);
    expect(updates.some((payload) => payload.status === "completed")).toBe(true);
    expect(updates.some((payload) => payload.result)).toBe(true);
  });

  it("does not expose raw IDs in model-safe proposal output", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                status: "pending",
                title: "Create task",
                summary: "Review quarterly report",
                expires_at: "2026-08-07T12:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const result = await proposeTask(supabase as never, USER_A, VALID_TASK_PAYLOAD);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/actionRequestId/i);
    expect(serialized).not.toMatch(/[0-9a-f-]{36}/i);
  });

  it("does not log payload contents for propose_task", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logToolCallDiagnostic(
      1,
      "propose_task",
      JSON.stringify({
        success: true,
        status: "pending",
        approvalRequired: true,
        title: "Secret task title",
        summary: "Secret summary",
      }),
    );

    const logged = JSON.stringify(logSpy.mock.calls[0]?.[1] ?? {});
    expect(logged).not.toContain("Secret task title");
    expect(logged).not.toContain("Secret summary");
    logSpy.mockRestore();
  });

  it("renders task previews for approvals UI", () => {
    const preview = buildRegisteredActionPreview(
      ACTION_TYPE_CREATE_TASK,
      VALID_TASK_PAYLOAD,
    );

    expect(preview?.actionLabel).toBe("Create task");
    expect(preview?.fields.map((field) => field.label)).toEqual(
      expect.arrayContaining(["Title", "Priority", "Due date", "Context"]),
    );
  });

  it("never renders raw JSON in task previews", () => {
    const preview = buildRegisteredActionPreview(
      ACTION_TYPE_CREATE_TASK,
      VALID_TASK_PAYLOAD,
    );

    for (const field of preview?.fields ?? []) {
      expect(field.value).not.toMatch(/^\s*[\[{]/);
    }
    expect(preview?.fields.every((field) => typeof field.value === "string")).toBe(
      true,
    );
  });

  it("uses approval_required in command-center approval banner", () => {
    const approvals = [
      {
        id: REQUEST_ID,
        title: "Create task",
        riskLevel: "approval_required",
      },
    ];

    const approvalRequired = approvals.find(
      (approval) => approval.riskLevel === "approval_required",
    );

    expect(approvalRequired?.title).toBe("Create task");
    expect(approvals.some((approval) => approval.riskLevel === "high")).toBe(false);
  });

  it("distinguishes direct versus failed task wording in main instructions", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("say you created the task");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("task creation failed");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).not.toContain("propose_task");
  });

  it("keeps Outlook proposal from creating events initially", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: REQUEST_ID,
                status: "pending",
                title: "Create Outlook calendar event",
                summary: "Team sync",
                expires_at: "2026-08-07T12:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const { proposeOutlookCalendarEvent } = await import(
      "@/lib/jarvis/tools/action-request-tools"
    );

    await proposeOutlookCalendarEvent(supabase as never, USER_A, {
      ...VALID_CALENDAR_PAYLOAD,
      locationName: null,
      notes: null,
    });

    expect(createOutlookCalendarEvent).not.toHaveBeenCalled();
  });

  it("executes Outlook approval through the registry once", async () => {
    vi.mocked(createOutlookCalendarEvent).mockResolvedValue({
      success: true,
      eventId: "event-hidden",
      subject: VALID_CALENDAR_PAYLOAD.subject,
      start: "2026-08-07T20:00:00.000Z",
      end: "2026-08-07T21:00:00.000Z",
      webLink: "https://outlook.example/event",
    });

    const result = await executeRegisteredAction(
      ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
      VALID_CALENDAR_PAYLOAD,
      bindSupabaseToExecutionContext(
        { actionRequestId: REQUEST_ID, userId: USER_A },
        {} as never,
      ),
    );

    expect(result.success).toBe(true);
    expect(createOutlookCalendarEvent).toHaveBeenCalledTimes(1);
  });

  it("validates Outlook payload fully at execution", () => {
    const invalid = validateCalendarEventPayload({
      subject: "Bad",
      startDateTime: "2026-08-07T16:00:00-05:00",
      endDateTime: "2026-08-07T15:00:00-05:00",
      timeZone: "America/Chicago",
      locationName: null,
      notes: null,
    });

    expect(invalid.success).toBe(false);
  });

  it("keeps Outlook concurrent approval idempotent via pending claim", async () => {
    expect(REGISTERED_ACTION_TYPES).toContain(
      ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
    );
    expect(getRegisteredExecutor(ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT)).not.toBeNull();
  });

  it("does not register Finance or Plaid write actions", () => {
    expect(isFinanceOrPlaidWriteAction("create_finance_transfer")).toBe(true);
    expect(isFinanceOrPlaidWriteAction("plaid_sync")).toBe(true);
    expect(getRegisteredExecutor("create_finance_transfer")).toBeNull();
    expect(REGISTERED_ACTION_TYPES).not.toContain("create_finance_transfer");
  });

  it("normalizes payloads consistently for deduplication", () => {
    const first = stableStringifyPayload({
      title: "A",
      priority: "medium",
      dueDate: null,
    });
    const second = stableStringifyPayload({
      dueDate: null,
      priority: "medium",
      title: "A",
    });
    expect(first).toBe(second);
  });
});
