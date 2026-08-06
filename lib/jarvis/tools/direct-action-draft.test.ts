import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_TYPE_CREATE_OUTLOOK_DRAFT } from "@/lib/jarvis/action-requests/action-type-constants";
import { createInteractiveMainJarvisContext } from "@/lib/jarvis/agents/tool-execution-context";
import { executeDirectCreateDraft } from "@/lib/jarvis/tools/direct-action-tools";
import { createOutlookDraft } from "@/lib/jarvis/tools/microsoft-tools";

const findReferenceMock = vi.fn();

vi.mock("@/lib/jarvis/tools/microsoft-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jarvis/tools/microsoft-tools")>();
  return {
    ...actual,
    createOutlookDraft: vi.fn(),
  };
});

vi.mock("@/lib/jarvis/tools/outlook-draft-references", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jarvis/tools/outlook-draft-references")>();
  return {
    ...actual,
    findOutlookDraftReferenceByActionRequest: (...args: unknown[]) =>
      findReferenceMock(...args),
    logOutlookDraftStageDiagnostic: vi.fn(),
  };
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOOL_CALL_ID = "call_draft_reconcile_001";
const MAIN_CONTEXT = createInteractiveMainJarvisContext(TOOL_CALL_ID);
const DRAFT_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function buildAutoExecuteSupabase(options?: {
  existingRecord?: Record<string, unknown> | null;
  completeAuditError?: boolean;
}) {
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: "audit-hidden" },
    error: null,
  });

  const updateEq = vi.fn().mockResolvedValue({
    error: options?.completeAuditError ? { code: "42501" } : null,
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
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: updateEq,
          }),
        }),
      }),
    })),
  };
}

describe("executeDirectCreateDraft reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes actionRequestId into createOutlookDraft after audit claim", async () => {
    vi.mocked(createOutlookDraft).mockResolvedValue({
      success: true,
      draftKey: DRAFT_KEY,
      subject: "Jarvis draft test",
      toRecipients: ["parker@melusi.ai"],
      ccRecipients: [],
      savedToDrafts: true,
      notSent: true,
      message: "The message was saved as a draft in Outlook and was not sent.",
    });

    const supabase = buildAutoExecuteSupabase({ existingRecord: null });

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
    expect(createOutlookDraft).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ actionRequestId: "audit-hidden" }),
    );
  });

  it("reconciles uncertain replay when a linked draft reference exists", async () => {
    findReferenceMock.mockResolvedValue({
      success: true,
      reference: {
        id: DRAFT_KEY,
        graph_message_id: "graph-message-hidden",
        sent_at: null,
      },
    });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "failed",
        result: null,
        provider_outcome_certainty: "uncertain",
      },
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

    expect(createOutlookDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      status: "completed",
      draftKey: DRAFT_KEY,
      savedToDrafts: true,
      notSent: true,
    });
    expect(JSON.stringify(result)).not.toContain("graph-message-hidden");
  });

  it("returns confirmed success when audit completion fails after reference reconciliation", async () => {
    findReferenceMock.mockResolvedValue({
      success: true,
      reference: {
        id: DRAFT_KEY,
        graph_message_id: "graph-message-hidden",
        sent_at: null,
      },
    });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "failed",
        result: null,
        provider_outcome_certainty: "uncertain",
      },
      completeAuditError: true,
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

    expect(result.success).toBe(true);
    expect(createOutlookDraft).not.toHaveBeenCalled();
  });

  it("remains uncertain on replay without a provable reference", async () => {
    findReferenceMock.mockResolvedValue({
      success: false,
      errorCode: "invalid_action_payload",
    });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "failed",
        result: null,
        provider_outcome_certainty: "uncertain",
      },
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
      errorCode: "draft_creation_outcome_uncertain",
      draftCreationOutcomeUncertain: true,
    });
    expect(createOutlookDraft).not.toHaveBeenCalled();
  });

  it("maps uncertain Graph plus reference failure to draft_creation_outcome_uncertain", async () => {
    vi.mocked(createOutlookDraft).mockResolvedValue({ success: false, outcome: "uncertain" });

    const supabase = buildAutoExecuteSupabase();

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
      errorCode: "draft_creation_outcome_uncertain",
    });
    expect(result).not.toMatchObject({ needsConnection: true, needsReconnect: true });
  });

  it("uses idempotency keys scoped to create_outlook_draft", async () => {
    vi.mocked(createOutlookDraft).mockResolvedValue({
      success: true,
      draftKey: DRAFT_KEY,
      subject: "Jarvis draft test",
      toRecipients: ["parker@melusi.ai"],
      ccRecipients: [],
      savedToDrafts: true,
      notSent: true,
      message: "The message was saved as a draft in Outlook and was not sent.",
    });

    const supabase = buildAutoExecuteSupabase({
      existingRecord: {
        id: "audit-hidden",
        status: "completed",
        result: {
          success: true,
          status: "completed",
          subject: "Jarvis draft test",
          toRecipientCount: 1,
          ccRecipientCount: 0,
          draftKey: DRAFT_KEY,
          savedToDrafts: true,
          notSent: true,
          message: "The message was saved as a draft in Outlook and was not sent.",
        },
        provider_outcome_certainty: "confirmed",
      },
    });

    await executeDirectCreateDraft(supabase as never, USER_ID, MAIN_CONTEXT, {
      toRecipients: ["parker@melusi.ai"],
      ccRecipients: [],
      subject: "Jarvis draft test",
      body: "Draft body",
    });

    expect(createOutlookDraft).not.toHaveBeenCalled();
    expect(`${ACTION_TYPE_CREATE_OUTLOOK_DRAFT}:${TOOL_CALL_ID}`).toContain(
      ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
    );
  });
});
