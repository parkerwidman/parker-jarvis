export const ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT =
  "create_outlook_calendar_event" as const;

export const ACTION_TYPE_CREATE_OUTLOOK_REMINDER =
  "create_outlook_reminder" as const;

export const ACTION_TYPE_CREATE_TASK = "create_task" as const;

export const ACTION_TYPE_SEND_OUTLOOK_EMAIL = "send_outlook_email" as const;

export const APPROVAL_REQUIRED_RISK_LEVEL = "approval_required" as const;

export const AUTO_EXECUTE_RISK_LEVEL = "low" as const;

export const EXECUTION_MODE_APPROVAL_REQUIRED = "approval_required" as const;

export const EXECUTION_MODE_AUTO_EXECUTE = "auto_execute" as const;

export const ACTION_REQUEST_EXPIRATION_MS = 24 * 60 * 60 * 1000;

export const REGISTERED_ACTION_TYPES = [
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_TASK,
] as const;

export type RegisteredActionType = (typeof REGISTERED_ACTION_TYPES)[number];

export function isRegisteredActionType(
  value: string,
): value is RegisteredActionType {
  return (REGISTERED_ACTION_TYPES as readonly string[]).includes(value);
}

export const AUTO_EXECUTED_ACTION_TYPES = [
  ACTION_TYPE_CREATE_TASK,
  ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_SEND_OUTLOOK_EMAIL,
] as const;
