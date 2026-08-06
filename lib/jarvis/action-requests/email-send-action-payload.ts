import {
  MAX_BODY_LENGTH,
  MAX_EMAIL_RECIPIENTS,
  MAX_SUBJECT_LENGTH,
  MAX_TOTAL_RECIPIENTS,
  normalizeEmailRecipientList,
} from "./datetime-validation";
import {
  normalizeOptionalPlainText,
  sanitizePlainText,
} from "./text-safety";

export type ValidatedEmailSendPayload = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyType: "text" | "html";
  draftKey: string | null;
};

export type EmailSendPayloadValidationResult =
  | { success: true; payload: ValidatedEmailSendPayload }
  | {
      success: false;
      errorCode:
        | "invalid_action_payload"
        | "clarification_required"
        | "unsupported_bulk_action";
    };

export function validateEmailSendPayload(
  payload: unknown,
): EmailSendPayloadValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const record = payload as Record<string, unknown>;

  const toResult = normalizeEmailRecipientList(
    record.to,
    "to",
    1,
    MAX_EMAIL_RECIPIENTS,
  );

  if (!toResult.success) {
    return { success: false, errorCode: toResult.errorCode };
  }

  const ccResult = normalizeEmailRecipientList(
    record.cc ?? [],
    "cc",
    0,
    MAX_EMAIL_RECIPIENTS,
  );

  if (!ccResult.success) {
    return { success: false, errorCode: ccResult.errorCode };
  }

  const bccResult = normalizeEmailRecipientList(
    record.bcc ?? [],
    "bcc",
    0,
    MAX_EMAIL_RECIPIENTS,
  );

  if (!bccResult.success) {
    return { success: false, errorCode: bccResult.errorCode };
  }

  const allRecipients = new Set([
    ...toResult.addresses,
    ...ccResult.addresses,
    ...bccResult.addresses,
  ]);

  if (allRecipients.size > MAX_TOTAL_RECIPIENTS) {
    return { success: false, errorCode: "unsupported_bulk_action" };
  }

  for (const toAddress of toResult.addresses) {
    if (
      ccResult.addresses.includes(toAddress) ||
      bccResult.addresses.includes(toAddress)
    ) {
      return { success: false, errorCode: "invalid_action_payload" };
    }
  }

  if (typeof record.subject !== "string" || typeof record.body !== "string") {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const subject = sanitizePlainText(record.subject);
  const body = record.body.trim();

  if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  let bodyType: "text" | "html" = "text";

  if (record.bodyType !== null && record.bodyType !== undefined) {
    if (record.bodyType !== "text" && record.bodyType !== "html") {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    bodyType = record.bodyType;
  }

  const draftKey = normalizeOptionalPlainText(
    typeof record.draftKey === "string" ? record.draftKey : null,
  );

  return {
    success: true,
    payload: {
      to: toResult.addresses,
      cc: ccResult.addresses,
      bcc: bccResult.addresses,
      subject,
      body,
      bodyType,
      draftKey,
    },
  };
}

export function buildEmailSendSummary(payload: ValidatedEmailSendPayload): string {
  return `Send email to ${payload.to.length} recipient(s): ${payload.subject}`;
}
