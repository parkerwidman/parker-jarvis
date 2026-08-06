import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAIN_JARVIS_AGENT, MELUSI_JARVIS_AGENT } from "@/lib/jarvis/agents/agent-registry";
import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import { logToolCallDiagnostic } from "@/lib/jarvis/agents/agent-diagnostics";
import {
  createInteractiveMainJarvisContext,
  createMelusiInteractiveContext,
  createNonInteractiveContext,
} from "@/lib/jarvis/agents/tool-execution-context";
import {
  getToolsForAgent,
  MAIN_JARVIS_TOOLS,
  MELUSI_JARVIS_TOOLS,
} from "@/lib/jarvis/agents/tool-definitions";
import { executeJarvisTool } from "@/lib/jarvis/agents/tool-executor";
import {
  isFinanceOrPlaidWriteActionType,
  isKnownWriteAction,
  resolveActionRisk,
} from "@/lib/jarvis/action-requests/action-risk-policy";
import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  ACTION_TYPE_CREATE_TASK,
  ACTION_TYPE_SEND_OUTLOOK_EMAIL,
} from "@/lib/jarvis/action-requests/action-type-constants";
import { validateDirectCalendarEventPayload } from "@/lib/jarvis/action-requests/direct-calendar-action-payload";
import { validateEmailSendPayload } from "@/lib/jarvis/action-requests/email-send-action-payload";
import { validateReminderPayload } from "@/lib/jarvis/action-requests/reminder-action-payload";
import { grantedScopesIncludeMailSend } from "@/lib/microsoft/scopes";
import {
  executeDirectCreateCalendarEvent,
  executeDirectCreateReminder,
  executeDirectCreateTask,
  executeDirectSendEmail,
} from "@/lib/jarvis/tools/direct-action-tools";
import { createTask } from "@/lib/jarvis/tools/task-tools";
import {
  createOutlookCalendarEventDirect,
  createOutlookReminder,
  sendOutlookEmail,
} from "@/lib/jarvis/tools/microsoft-tools";

vi.mock("@/lib/jarvis/tools/task-tools", () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  completeTask: vi.fn(),
}));

vi.mock("@/lib/jarvis/tools/microsoft-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jarvis/tools/microsoft-tools")>();
  return {
    ...actual,
    createOutlookReminder: vi.fn(),
    createOutlookCalendarEventDirect: vi.fn(),
    sendOutlookEmail: vi.fn(),
    listOutlookInbox: vi.fn(),
    listOutlookCalendar: vi.fn(),
    createOutlookDraft: vi.fn(),
    createOutlookCalendarEvent: vi.fn(),
  };
});

const USER_A = "11111111-1111-4111-8111-111111111111";
const TOOL_CALL_ID = "call_test_001";

const MAIN_CONTEXT = createInteractiveMainJarvisContext(TOOL_CALL_ID);
const MELUSI_CONTEXT = createMelusiInteractiveContext(TOOL_CALL_ID);
const BACKGROUND_CONTEXT = createNonInteractiveContext();

function buildAutoExecuteSupabase(options?: {
  existingRecord?: Record<string, unknown> | null;
  insertId?: string;
}) {
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: options?.insertId ?? "audit-hidden" },
    error: null,
  });

  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  });

  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.existingRecord ?? null,
    error: null,
  });

  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: insertSingle }),
      }),
      update,
    })),
    insertSingle,
    update,
    maybeSingle,
  };
}

describe("low-friction personal productivity actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults unknown write actions to forbidden", () => {
    expect(resolveActionRisk("delete_everything", MAIN_CONTEXT)).toBe("forbidden");
    expect(isKnownWriteAction("delete_everything")).toBe(false);
  });

  it("allows auto_execute only for active authenticated main-Jarvis turns", () => {
    expect(resolveActionRisk(ACTION_TYPE_CREATE_TASK, MAIN_CONTEXT)).toBe("auto_execute");
    expect(resolveActionRisk(ACTION_TYPE_CREATE_TASK, BACKGROUND_CONTEXT)).toBe("forbidden");
    expect(resolveActionRisk(ACTION_TYPE_CREATE_TASK, MELUSI_CONTEXT)).toBe("auto_execute");
  });

  it("blocks cron/background contexts from personal write tools", () => {
    expect(resolveActionRisk(ACTION_TYPE_CREATE_OUTLOOK_REMINDER, BACKGROUND_CONTEXT)).toBe(
      "forbidden",
    );
    expect(resolveActionRisk(ACTION_TYPE_SEND_OUTLOOK_EMAIL, BACKGROUND_CONTEXT)).toBe(
      "forbidden",
    );
  });

  it("registers direct create_task on main Jarvis", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).toContain("create_task");
  });

  it("does not register propose_task on main Jarvis", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("propose_task");
  });

  it("creates a task immediately with no approval request", async () => {
    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "hidden",
        title: "Buy groceries",
        status: "todo",
        priority: "medium",
        due_at: null,
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const supabase = buildAutoExecuteSupabase();

    const result = await executeDirectCreateTask(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      { title: "Buy groceries", priority: "medium", dueDate: null, description: null, context: null },
    );

    expect(result.success).toBe(true);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith("action_requests");
  });

  it("does not create duplicate tasks on retry", async () => {
    vi.mocked(createTask).mockResolvedValue({
      success: true,
      task: {
        id: "hidden",
        title: "Buy groceries",
        status: "todo",
        priority: "medium",
        due_at: null,
        completed_at: null,
        created_at: "2026-08-06T12:00:00.000Z",
      },
    });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "completed",
        result: {
          success: true,
          status: "completed",
          title: "Buy groceries",
          priority: "medium",
          dueDate: null,
        },
        provider_outcome_certainty: "confirmed",
      },
    });

    const result = await executeDirectCreateTask(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      { title: "Buy groceries", priority: "medium", dueDate: null, description: null, context: null },
    );

    expect(result.success).toBe(true);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("does not claim completion when task insertion fails", async () => {
    vi.mocked(createTask).mockResolvedValue({ success: false, error: "Could not create task." });

    const supabase = buildAutoExecuteSupabase();

    const result = await executeDirectCreateTask(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      { title: "Buy groceries", priority: "medium", dueDate: null, description: null, context: null },
    );

    expect(result).toMatchObject({ success: false, errorCode: "task_creation_failed" });
  });

  it("keeps Melusi direct create_task behavior", () => {
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).toContain("create_task");
    expect(resolveActionRisk(ACTION_TYPE_CREATE_TASK, MELUSI_CONTEXT)).toBe("auto_execute");
  });

  it("exposes create_outlook_reminder only on main Jarvis", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).toContain("create_outlook_reminder");
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("create_outlook_reminder");
  });

  it("validates reminder payload without attendees", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const validated = validateReminderPayload({
      title: "Take a break",
      remindAt: future,
      timeZone: "America/Chicago",
      notes: null,
      durationMinutes: 15,
      reminderMinutesBeforeStart: 0,
    });

    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.payload.reminderMinutesBeforeStart).toBe(0);
      expect(validated.payload.eventEndDateTime > validated.payload.eventStartDateTime).toBe(true);
    }
  });

  it("rejects past reminders", () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const validated = validateReminderPayload({
      title: "Late",
      remindAt: past,
      timeZone: "America/Chicago",
      notes: null,
      durationMinutes: null,
      reminderMinutesBeforeStart: null,
    });

    expect(validated.success).toBe(false);
  });

  it("creates reminders idempotently", async () => {
    vi.mocked(createOutlookReminder).mockResolvedValue({ success: true });

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "completed",
        result: {
          success: true,
          status: "completed",
          title: "Break",
          remindAt: future,
          timeZone: "America/Chicago",
        },
        provider_outcome_certainty: "confirmed",
      },
    });

    const result = await executeDirectCreateReminder(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        title: "Break",
        remindAt: future,
        timeZone: "America/Chicago",
        notes: null,
        durationMinutes: 15,
        reminderMinutesBeforeStart: 0,
      },
    );

    expect(result.success).toBe(true);
    expect(createOutlookReminder).not.toHaveBeenCalled();
  });

  it("auto-executes calendar events with attendees", async () => {
    vi.mocked(createOutlookCalendarEventDirect).mockResolvedValue({ success: true });

    const supabase = buildAutoExecuteSupabase();
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    const result = await executeDirectCreateCalendarEvent(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        subject: "Sync",
        startDateTime: start,
        endDateTime: end,
        timeZone: "America/Chicago",
        locationName: null,
        notes: null,
        attendees: ["friend@example.com"],
      },
    );

    expect(result.success).toBe(true);
    expect(createOutlookCalendarEventDirect).toHaveBeenCalledTimes(1);
  });

  it("requires clarification for ambiguous attendee emails", () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    const validated = validateDirectCalendarEventPayload({
      subject: "Sync",
      startDateTime: start,
      endDateTime: end,
      timeZone: "America/Chicago",
      locationName: null,
      notes: null,
      attendees: ["not-an-email"],
    });

    expect(validated.success).toBe(false);
    if (!validated.success) {
      expect(validated.errorCode).toBe("clarification_required");
    }
  });

  it("validates bounded email recipients and rejects bulk sends", () => {
    const valid = validateEmailSendPayload({
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      subject: "Hello",
      body: "Body",
      bodyType: "text",
      draftKey: null,
    });

    expect(valid.success).toBe(true);

    const bulk = validateEmailSendPayload({
      to: Array.from({ length: 11 }, (_, index) => `user${index}@example.com`),
      cc: [],
      bcc: [],
      subject: "Bulk",
      body: "Body",
      bodyType: "text",
      draftKey: null,
    });

    expect(bulk.success).toBe(false);
    if (!bulk.success) {
      expect(bulk.errorCode).toBe("unsupported_bulk_action");
    }
  });

  it("returns microsoft_permission_required when Mail.Send is absent", async () => {
    vi.mocked(sendOutlookEmail).mockResolvedValue({
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: "Mail.Send",
      error: "Microsoft Mail.Send permission is required.",
    });

    const supabase = buildAutoExecuteSupabase();

    const result = await executeDirectSendEmail(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        to: ["a@example.com"],
        subject: "Hello",
        body: "Body",
      },
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "microsoft_permission_required",
      requiredPermission: "Mail.Send",
    });
  });

  it("does not send twice after a successful send replay", async () => {
    vi.mocked(sendOutlookEmail).mockResolvedValue({ success: true });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "completed",
        result: {
          success: true,
          status: "completed",
          subject: "Hello",
          recipientCount: 1,
        },
        provider_outcome_certainty: "confirmed",
      },
    });

    const result = await executeDirectSendEmail(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        to: ["a@example.com"],
        subject: "Hello",
        body: "Body",
      },
    );

    expect(result.success).toBe(true);
    expect(sendOutlookEmail).not.toHaveBeenCalled();
  });

  it("blocks blind retry after uncertain send outcomes", async () => {
    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "failed",
        result: null,
        provider_outcome_certainty: "uncertain",
      },
    });

    const result = await executeDirectSendEmail(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        to: ["a@example.com"],
        subject: "Hello",
        body: "Body",
      },
    );

    expect(result).toMatchObject({ errorCode: "duplicate_execution_blocked" });
    expect(sendOutlookEmail).not.toHaveBeenCalled();
  });

  it("forbids specialists from personal Outlook write tools", () => {
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain(
      "create_outlook_calendar_event",
    );
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).not.toContain("send_outlook_email");
  });

  it("does not register Finance or Plaid write actions", () => {
    expect(isFinanceOrPlaidWriteActionType("plaid_sync")).toBe(true);
    expect(getToolsForAgent("main").map((tool) => tool.name)).not.toContain(
      "create_finance_transfer",
    );
  });

  it("does not log sensitive write-tool payload contents", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logToolCallDiagnostic(
      1,
      "create_task",
      JSON.stringify({
        success: true,
        status: "completed",
        title: "Secret task title",
      }),
    );

    const logged = JSON.stringify(logSpy.mock.calls[0]?.[1] ?? {});
    expect(logged).not.toContain("Secret task title");
    logSpy.mockRestore();
  });

  it("uses truthful direct-action wording in main instructions", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("say you created the task");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("saved as a draft");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("say you sent the email");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).not.toContain("propose_task");
  });

  it("detects missing Mail.Send in granted scopes", () => {
    expect(grantedScopesIncludeMailSend("Mail.ReadWrite Calendars.ReadWrite")).toBe(false);
    expect(grantedScopesIncludeMailSend("Mail.ReadWrite Mail.Send Calendars.ReadWrite")).toBe(
      true,
    );
  });

  it("blocks direct write tools outside interactive main execution", async () => {
    const output = await executeJarvisTool(
      buildAutoExecuteSupabase() as never,
      USER_A,
      {
        type: "function_call",
        name: "create_outlook_reminder",
        call_id: TOOL_CALL_ID,
        arguments: JSON.stringify({
          title: "Test",
          remindAt: new Date(Date.now() + 3600000).toISOString(),
          timeZone: "America/Chicago",
          notes: null,
          durationMinutes: null,
          reminderMinutesBeforeStart: null,
        }),
      } as never,
      null,
      BACKGROUND_CONTEXT,
    );

    const parsed = JSON.parse(output);
    expect(parsed.errorCode).toBe("action_forbidden");
  });

  it("includes main personal write tools in main agent config", () => {
    expect(MAIN_JARVIS_AGENT.toolGroups).toContain("main_personal_writes");
    expect(MAIN_JARVIS_AGENT.toolGroups).not.toContain("action_requests");
  });
});

describe("low-friction action tool result privacy", () => {
  it("does not expose graph ids in reminder tool results", async () => {
    vi.mocked(createOutlookReminder).mockResolvedValue({ success: true });
    const supabase = buildAutoExecuteSupabase();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const result = await executeDirectCreateReminder(
      supabase as never,
      USER_A,
      MAIN_CONTEXT,
      {
        title: "Break",
        remindAt: future,
        timeZone: "America/Chicago",
        notes: null,
        durationMinutes: 15,
        reminderMinutesBeforeStart: 0,
      },
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/eventId|graph/i);
    expect(serialized).not.toMatch(/[0-9a-f-]{36}/i);
  });
});
