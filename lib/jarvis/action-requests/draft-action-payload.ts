import {
  MAX_BODY_LENGTH,
  MAX_EMAIL_RECIPIENTS,
  MAX_SUBJECT_LENGTH,
  normalizeEmailRecipientList,
} from "./datetime-validation";
import { sanitizePlainText } from "./text-safety";

export type ValidatedDraftPayload = {
  toRecipients: string[];
  ccRecipients: string[];
  subject: string;
  body: string;
};

export type DraftPayloadValidationResult =
  | { success: true; payload: ValidatedDraftPayload }
  | { success: false; errorCode: "invalid_action_payload" };

export function validateDraftPayload(
  payload: unknown,
): DraftPayloadValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const record = payload as Record<string, unknown>;

  const toResult = normalizeEmailRecipientList(
    record.toRecipients,
    "toRecipients",
    1,
    MAX_EMAIL_RECIPIENTS,
  );

  if (!toResult.success) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const ccResult = normalizeEmailRecipientList(
    record.ccRecipients ?? [],
    "ccRecipients",
    0,
    MAX_EMAIL_RECIPIENTS,
  );

  if (!ccResult.success) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const toSet = new Set(toResult.addresses);

  for (const address of ccResult.addresses) {
    if (toSet.has(address)) {
      return { success: false, errorCode: "invalid_action_payload" };
    }
  }

  if (typeof record.subject !== "string" || typeof record.body !== "string") {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const subject = sanitizePlainText(record.subject);
  const body = sanitizePlainText(record.body);

  if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  return {
    success: true,
    payload: {
      toRecipients: toResult.addresses,
      ccRecipients: ccResult.addresses,
      subject,
      body,
    },
  };
}

export function buildDraftSummary(payload: ValidatedDraftPayload): string {
  const recipientCount = payload.toRecipients.length + payload.ccRecipients.length;
  return `${payload.subject} (${recipientCount} recipient${recipientCount === 1 ? "" : "s"})`;
}
