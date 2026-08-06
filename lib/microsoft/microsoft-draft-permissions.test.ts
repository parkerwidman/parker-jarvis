import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MICROSOFT_GRANTED_SCOPES_UNKNOWN,
  MICROSOFT_MAIL_READ_WRITE_SCOPE,
  resolveMailReadWritePermissionState,
  scopesWithoutMailReadWrite,
} from "@/lib/microsoft/scopes";
import {
  getMailReadWritePermissionState,
  recordMailReadWriteMissing,
  recordMailReadWriteVerified,
} from "@/lib/microsoft/token-manager";
import { createOutlookDraft } from "@/lib/jarvis/tools/microsoft-tools";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTION_REQUEST_ID = "22222222-2222-4222-8222-222222222222";

const graphPostMock = vi.fn();
const graphPostDetailedMock = vi.fn();
const storeDraftReferenceMock = vi.fn();

vi.mock("@/lib/microsoft/graph-client", () => ({
  microsoftGraphGet: vi.fn(),
  microsoftGraphPost: (...args: unknown[]) => graphPostMock(...args),
  microsoftGraphPostDetailed: (...args: unknown[]) => graphPostDetailedMock(...args),
  microsoftGraphPatch: vi.fn(),
}));

vi.mock("@/lib/jarvis/tools/outlook-draft-references", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jarvis/tools/outlook-draft-references")>();
  return {
    ...actual,
    resolveOutlookDraftReference: vi.fn(),
    markOutlookDraftReferenceSent: vi.fn(),
    storeOutlookDraftReference: (...args: unknown[]) => storeDraftReferenceMock(...args),
  };
});

function buildScopesSupabase(grantedScopes: string | null) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  fromMock.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: grantedScopes === null ? null : { granted_scopes: grantedScopes },
          error: null,
        })),
      })),
    })),
    update,
  }));

  return { update };
}

const fromMock = vi.fn();

const VALID_DRAFT_INPUT = {
  toRecipients: ["parker@melusi.ai"],
  ccRecipients: [] as string[],
  subject: "Jarvis draft test",
  body: "This email should remain saved as a draft and must not be sent.",
};

describe("mail.readwrite permission state", () => {
  it("resolves granted when Mail.ReadWrite is explicitly present", () => {
    expect(
      resolveMailReadWritePermissionState("Mail.ReadWrite Mail.Send Calendars.ReadWrite"),
    ).toBe("granted");
  });

  it("resolves missing when explicit scopes exclude Mail.ReadWrite", () => {
    expect(resolveMailReadWritePermissionState("Mail.Send Calendars.ReadWrite")).toBe(
      "missing",
    );
  });

  it("resolves unknown for empty granted scopes", () => {
    expect(resolveMailReadWritePermissionState(MICROSOFT_GRANTED_SCOPES_UNKNOWN)).toBe(
      "unknown",
    );
    expect(resolveMailReadWritePermissionState(null)).toBe("unknown");
  });
});

describe("createOutlookDraft permission gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeDraftReferenceMock.mockResolvedValue({
      success: true,
      draftKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });

  it("blocks Graph and returns microsoft_permission_required when Mail.ReadWrite is known missing", async () => {
    buildScopesSupabase("Mail.Send Calendars.ReadWrite");

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result).toMatchObject({
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_READ_WRITE_SCOPE,
    });
    expect(graphPostMock).not.toHaveBeenCalled();
    expect(graphPostDetailedMock).not.toHaveBeenCalled();
  });

  it("allows one protected draft attempt when Mail.ReadWrite permission is unknown", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.notSent).toBe(true);
      expect(result.savedToDrafts).toBe(true);
    }
    expect(graphPostDetailedMock).toHaveBeenCalledTimes(1);
    expect(graphPostMock).not.toHaveBeenCalled();
  });

  it("uses POST /v1.0/me/messages with Text body and recipient shape", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(graphPostMock).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "/v1.0/me/messages",
      {
        subject: VALID_DRAFT_INPUT.subject,
        body: { contentType: "Text", content: VALID_DRAFT_INPUT.body },
        toRecipients: [{ emailAddress: { address: "parker@melusi.ai" } }],
        ccRecipients: [],
      },
    );
  });

  it("never calls sendMail when creating a draft", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    for (const call of [...graphPostMock.mock.calls, ...graphPostDetailedMock.mock.calls]) {
      expect(String(call[2])).not.toContain("sendMail");
      expect(String(call[2])).not.toContain("/send");
    }
  });

  it("maps confirmed Graph permission denial to microsoft_permission_required", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({
      success: false,
      error: "Microsoft Graph request failed.",
      failureKind: "permission_denied",
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result).toMatchObject({
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_READ_WRITE_SCOPE,
    });
  });

  it("returns uncertain outcome for ambiguous draft failures", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({
      success: false,
      error: "Microsoft Graph request failed.",
      failureKind: "ambiguous",
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result).toEqual({ success: false, outcome: "uncertain" });
  });

  it("fails safely when Graph returns success without a message id", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({ success: true, data: { subject: "No id" } });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result).toMatchObject({ success: false, error: "Could not create Outlook draft." });
  });

  it("returns uncertain when local draft reference storage fails after Graph success", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });
    storeDraftReferenceMock.mockResolvedValue({ success: false });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result).toEqual({ success: false, outcome: "uncertain" });
  });

  it("returns uncertain when Graph succeeds without an actionRequestId for reference storage", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, VALID_DRAFT_INPUT);

    expect(result).toEqual({ success: false, outcome: "uncertain" });
    expect(storeDraftReferenceMock).not.toHaveBeenCalled();
  });

  it("stores an opaque draftKey and exposes no Graph id on success", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result.success).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("draftKey");
    expect(serialized).not.toContain("graph-message-hidden");
    expect(storeDraftReferenceMock).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "graph-message-hidden",
      ACTION_REQUEST_ID,
    );
  });

  it("rejects invalid recipients before Graph", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      toRecipients: ["not-an-email"],
    });

    expect(result.success).toBe(false);
    expect(graphPostMock).not.toHaveBeenCalled();
  });

  it("uses the standard Graph path when Mail.ReadWrite is known granted", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({
      success: true,
      data: { id: "graph-message-hidden" },
    });

    const result = await createOutlookDraft({ from: fromMock } as never, USER_ID, {
      ...VALID_DRAFT_INPUT,
      actionRequestId: ACTION_REQUEST_ID,
    });

    expect(result.success).toBe(true);
    expect(graphPostMock).toHaveBeenCalledTimes(1);
    expect(graphPostDetailedMock).not.toHaveBeenCalled();
  });
});

describe("token-manager mail.readwrite persistence helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records Mail.ReadWrite as operational after a successful unknown-state draft", async () => {
    const { update } = buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);

    await recordMailReadWriteVerified({ from: fromMock } as never, USER_ID);

    expect(update).toHaveBeenCalledWith({
      granted_scopes: MICROSOFT_MAIL_READ_WRITE_SCOPE,
    });
  });

  it("records Mail.ReadWrite as missing after confirmed Graph permission denial", async () => {
    const { update } = buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);

    await recordMailReadWriteMissing({ from: fromMock } as never, USER_ID);

    expect(update).toHaveBeenCalledWith({ granted_scopes: scopesWithoutMailReadWrite() });
  });

  it("checks Mail.ReadWrite permission state through token-manager", async () => {
    buildScopesSupabase("Mail.Send Calendars.ReadWrite");

    await expect(
      getMailReadWritePermissionState({ from: fromMock } as never, USER_ID),
    ).resolves.toBe("missing");
  });
});
