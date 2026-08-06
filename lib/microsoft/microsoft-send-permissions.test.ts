import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyGraphSendFailure,
  isConfirmedGraphPermissionDenied,
} from "@/lib/microsoft/graph-errors";
import {
  MICROSOFT_GRANTED_SCOPES_UNKNOWN,
  MICROSOFT_MAIL_SEND_SCOPE,
  resolveMailSendPermissionState,
  scopesWithoutMailSend,
} from "@/lib/microsoft/scopes";
import {
  getMailSendPermissionState,
  recordMailSendMissing,
  recordMailSendVerified,
  userHasMailSendPermission,
} from "@/lib/microsoft/token-manager";
import { sendOutlookEmail } from "@/lib/jarvis/tools/microsoft-tools";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const graphPostMock = vi.fn();
const graphPostDetailedMock = vi.fn();

vi.mock("@/lib/microsoft/graph-client", () => ({
  microsoftGraphGet: vi.fn(),
  microsoftGraphPost: (...args: unknown[]) => graphPostMock(...args),
  microsoftGraphPostDetailed: (...args: unknown[]) => graphPostDetailedMock(...args),
  microsoftGraphPatch: vi.fn(),
}));

vi.mock("@/lib/jarvis/tools/outlook-draft-references", () => ({
  resolveOutlookDraftReference: vi.fn(),
  markOutlookDraftReferenceSent: vi.fn(),
  storeOutlookDraftReference: vi.fn(),
}));

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

describe("mail.send permission state", () => {
  it("resolves granted when Mail.Send is explicitly present", () => {
    expect(
      resolveMailSendPermissionState("Mail.ReadWrite Mail.Send Calendars.ReadWrite"),
    ).toBe("granted");
  });

  it("resolves missing when explicit scopes exclude Mail.Send", () => {
    expect(resolveMailSendPermissionState("Mail.ReadWrite Calendars.ReadWrite")).toBe(
      "missing",
    );
  });

  it("resolves unknown for empty granted scopes", () => {
    expect(resolveMailSendPermissionState(MICROSOFT_GRANTED_SCOPES_UNKNOWN)).toBe(
      "unknown",
    );
    expect(resolveMailSendPermissionState(null)).toBe("unknown");
  });
});

describe("graph permission error mapping", () => {
  it("maps confirmed permission-denied Graph errors", () => {
    expect(
      isConfirmedGraphPermissionDenied({
        error: { code: "ErrorAccessDenied" },
      }),
    ).toBe(true);
    expect(
      classifyGraphSendFailure(403, {
        error: { code: "Authorization_RequestDenied" },
      }),
    ).toBe("permission_denied");
  });

  it("does not treat unrelated 401/403 responses as missing permission", () => {
    expect(classifyGraphSendFailure(401, { error: { code: "InvalidAuthenticationToken" } })).toBe(
      "auth_error",
    );
    expect(classifyGraphSendFailure(403, { error: { code: "UnknownError" } })).toBe(
      "ambiguous",
    );
  });
});

describe("sendOutlookEmail permission gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks Graph and returns microsoft_permission_required when Mail.Send is known missing", async () => {
    buildScopesSupabase("Mail.ReadWrite Calendars.ReadWrite");

    const result = await sendOutlookEmail({ from: fromMock } as never, USER_ID, {
      payload: {
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        body: "Body",
        bodyType: "text",
        draftKey: null,
      },
    });

    expect(result).toMatchObject({
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_SEND_SCOPE,
    });
    expect(graphPostMock).not.toHaveBeenCalled();
    expect(graphPostDetailedMock).not.toHaveBeenCalled();
  });

  it("allows one protected send attempt when Mail.Send permission is unknown", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({ success: true, data: null });

    const result = await sendOutlookEmail({ from: fromMock } as never, USER_ID, {
      payload: {
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        body: "Body",
        bodyType: "text",
        draftKey: null,
      },
    });

    expect(result).toEqual({ success: true });
    expect(graphPostDetailedMock).toHaveBeenCalledTimes(1);
    expect(graphPostMock).not.toHaveBeenCalled();
  });

  it("maps confirmed Graph insufficient-permission responses to microsoft_permission_required", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({
      success: false,
      error: "Microsoft Graph request failed.",
      failureKind: "permission_denied",
    });

    const result = await sendOutlookEmail({ from: fromMock } as never, USER_ID, {
      payload: {
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        body: "Body",
        bodyType: "text",
        draftKey: null,
      },
    });

    expect(result).toMatchObject({
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_SEND_SCOPE,
    });
  });

  it("returns uncertain outcome for ambiguous send failures", async () => {
    buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
    graphPostDetailedMock.mockResolvedValue({
      success: false,
      error: "Microsoft Graph request failed.",
      failureKind: "ambiguous",
    });

    const result = await sendOutlookEmail({ from: fromMock } as never, USER_ID, {
      payload: {
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        body: "Body",
        bodyType: "text",
        draftKey: null,
      },
    });

    expect(result).toEqual({ success: false, outcome: "uncertain" });
  });

  it("uses the standard Graph send path when Mail.Send is known granted", async () => {
    buildScopesSupabase("Mail.ReadWrite Mail.Send Calendars.ReadWrite");
    graphPostMock.mockResolvedValue({ success: true, data: null });

    const result = await sendOutlookEmail({ from: fromMock } as never, USER_ID, {
      payload: {
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        body: "Body",
        bodyType: "text",
        draftKey: null,
      },
    });

    expect(result).toEqual({ success: true });
    expect(graphPostMock).toHaveBeenCalledTimes(1);
    expect(graphPostDetailedMock).not.toHaveBeenCalled();
  });
});

describe("token-manager mail.send persistence helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records Mail.Send as operational after a successful unknown-state send", async () => {
    const { update } = buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);

    await recordMailSendVerified({ from: fromMock } as never, USER_ID);

    expect(update).toHaveBeenCalledWith({ granted_scopes: MICROSOFT_MAIL_SEND_SCOPE });
  });

  it("records Mail.Send as missing after confirmed Graph permission denial", async () => {
    const { update } = buildScopesSupabase(MICROSOFT_GRANTED_SCOPES_UNKNOWN);

    await recordMailSendMissing({ from: fromMock } as never, USER_ID);

    expect(update).toHaveBeenCalledWith({ granted_scopes: scopesWithoutMailSend() });
  });

  it("checks permission state through token-manager", async () => {
    buildScopesSupabase("Mail.ReadWrite Calendars.ReadWrite");

    await expect(getMailSendPermissionState({ from: fromMock } as never, USER_ID)).resolves.toBe(
      "missing",
    );
    await expect(userHasMailSendPermission({ from: fromMock } as never, USER_ID)).resolves.toBe(
      false,
    );
  });
});
