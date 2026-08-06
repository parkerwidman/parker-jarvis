import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_TYPE_CREATE_OUTLOOK_DRAFT } from "@/lib/jarvis/action-requests/action-type-constants";
import {
  claimAutoExecuteAction,
  mapAutoExecuteClaimFailure,
} from "@/lib/jarvis/action-requests/auto-execute-audit";
import { createInteractiveMainJarvisContext } from "@/lib/jarvis/agents/tool-execution-context";
import { executeDirectCreateDraft } from "@/lib/jarvis/tools/direct-action-tools";
import { createOutlookDraft } from "@/lib/jarvis/tools/microsoft-tools";

vi.mock("@/lib/jarvis/tools/microsoft-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jarvis/tools/microsoft-tools")>();
  return {
    ...actual,
    createOutlookDraft: vi.fn(),
  };
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOOL_CALL_ID = "call_audit_test_001";
const MAIN_CONTEXT = createInteractiveMainJarvisContext(TOOL_CALL_ID);

function buildClaimSupabase(options?: {
  existingRecord?: Record<string, unknown> | null;
  insertError?: { code: string; message?: string } | null;
  lookupError?: { code: string; message?: string } | null;
}) {
  const insertSingle = vi.fn().mockResolvedValue({
    data: options?.insertError ? null : { id: "audit-hidden" },
    error: options?.insertError ?? null,
  });

  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.existingRecord ?? null,
    error: options?.lookupError ?? null,
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
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    })),
    insertSingle,
    maybeSingle,
  };
}

describe("auto-execute audit claim failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies check-constraint insert failures as audit_schema_failure", async () => {
    const supabase = buildClaimSupabase({
      insertError: { code: "23514", message: "action_requests_action_type_check" },
    });

    const result = await claimAutoExecuteAction(supabase as never, {
      userId: USER_ID,
      actionType: ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
      idempotencyKey: `${ACTION_TYPE_CREATE_OUTLOOK_DRAFT}:${TOOL_CALL_ID}`,
      title: "Create Outlook draft",
      summary: "Draft summary",
      payload: { subject: "Test", toRecipientCount: 1, ccRecipientCount: 0 },
    });

    expect(result).toEqual({ success: false, errorCode: "audit_schema_failure" });
  });

  it("maps audit claim failures to draft_creation_failed without connection flags", () => {
    expect(
      mapAutoExecuteClaimFailure("audit_schema_failure", "draft_creation_failed"),
    ).toEqual({ success: false, errorCode: "draft_creation_failed" });
    expect(
      mapAutoExecuteClaimFailure("action_unavailable", "draft_creation_failed"),
    ).toEqual({ success: false, errorCode: "draft_creation_failed" });
  });

  it("does not call Graph when audit schema insert fails", async () => {
    const supabase = buildClaimSupabase({
      insertError: { code: "23514" },
    });

    const result = await executeDirectCreateDraft(
      supabase as never,
      USER_ID,
      MAIN_CONTEXT,
      {
        toRecipients: ["parker@melusi.ai"],
        ccRecipients: [],
        subject: "Jarvis draft test",
        body: "Draft body",
      },
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "draft_creation_failed",
    });
    expect(result).not.toMatchObject({ needsConnection: true, needsReconnect: true });
    expect(createOutlookDraft).not.toHaveBeenCalled();
  });

  it("returns uncertain failed audits as replay candidates for reconciliation", async () => {
    const supabase = buildClaimSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "failed",
        result: null,
        provider_outcome_certainty: "uncertain",
      },
    });

    const result = await claimAutoExecuteAction(supabase as never, {
      userId: USER_ID,
      actionType: ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
      idempotencyKey: `${ACTION_TYPE_CREATE_OUTLOOK_DRAFT}:${TOOL_CALL_ID}`,
      title: "Create Outlook draft",
      summary: "Draft summary",
      payload: { subject: "Test", toRecipientCount: 1, ccRecipientCount: 0 },
    });

    expect(result).toMatchObject({
      success: true,
      isReplay: true,
      providerOutcomeCertainty: "uncertain",
    });
  });

  it("claims draft audit successfully before Graph on a valid insert", async () => {
    vi.mocked(createOutlookDraft).mockResolvedValue({
      success: true,
      draftKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      subject: "Jarvis draft test",
      toRecipients: ["parker@melusi.ai"],
      ccRecipients: [],
      savedToDrafts: true,
      notSent: true,
      message: "The message was saved as a draft in Outlook and was not sent.",
    });

    const supabase = buildClaimSupabase();
    const result = await executeDirectCreateDraft(
      supabase as never,
      USER_ID,
      MAIN_CONTEXT,
      {
        toRecipients: ["parker@melusi.ai"],
        ccRecipients: [],
        subject: "Jarvis draft test",
        body: "Draft body",
      },
    );

    expect(result.success).toBe(true);
    expect(createOutlookDraft).toHaveBeenCalledTimes(1);
  });
});
