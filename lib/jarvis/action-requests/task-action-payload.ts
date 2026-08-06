import {
  normalizeOptionalPlainText,
  sanitizePlainText,
} from "./text-safety";

export const VALID_TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof VALID_TASK_PRIORITIES)[number];

export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_TASK_DESCRIPTION_LENGTH = 2000;
export const MAX_TASK_CONTEXT_LENGTH = 500;

export type ValidatedTaskPayload = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  context: string | null;
};

export type TaskPayloadValidationResult =
  | { success: true; payload: ValidatedTaskPayload }
  | { success: false; errorCode: "invalid_action_payload" };

function parseDueDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

export function validateTaskPayload(
  payload: unknown,
): TaskPayloadValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.title !== "string") {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const title = sanitizePlainText(record.title);

  if (title.length === 0 || title.length > MAX_TASK_TITLE_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const description = normalizeOptionalPlainText(
    typeof record.description === "string" ? record.description : null,
  );

  if (description && description.length > MAX_TASK_DESCRIPTION_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const context = normalizeOptionalPlainText(
    typeof record.context === "string" ? record.context : null,
  );

  if (context && context.length > MAX_TASK_CONTEXT_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  let priority: TaskPriority = "medium";

  if (record.priority !== null && record.priority !== undefined) {
    if (typeof record.priority !== "string") {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    const normalizedPriority = record.priority.trim();

    if (
      !(VALID_TASK_PRIORITIES as readonly string[]).includes(normalizedPriority)
    ) {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    priority = normalizedPriority as TaskPriority;
  }

  let dueDate: string | null = null;

  if (record.dueDate !== null && record.dueDate !== undefined) {
    if (typeof record.dueDate !== "string") {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    dueDate = parseDueDate(record.dueDate);

    if (!dueDate) {
      return { success: false, errorCode: "invalid_action_payload" };
    }
  }

  return {
    success: true,
    payload: {
      title,
      description,
      priority,
      dueDate,
      context,
    },
  };
}

export function validateTaskProposalInput(input: {
  title: string;
  description?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  context?: string | null;
}): TaskPayloadValidationResult {
  return validateTaskPayload({
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ?? null,
    context: input.context ?? null,
  });
}

export function buildTaskSummary(payload: ValidatedTaskPayload): string {
  const parts = [payload.title, `Priority: ${payload.priority}`];

  if (payload.dueDate) {
    parts.push(`Due: ${payload.dueDate}`);
  }

  if (payload.description) {
    parts.push(payload.description);
  }

  if (payload.context) {
    parts.push(`Context: ${payload.context}`);
  }

  return parts.join(" — ");
}

export function buildTaskNotes(payload: ValidatedTaskPayload): string | null {
  const parts: string[] = [];

  if (payload.description) {
    parts.push(payload.description);
  }

  if (payload.context) {
    parts.push(`Context: ${payload.context}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

export function normalizeTaskPayloadForDedup(
  payload: ValidatedTaskPayload,
): Record<string, unknown> {
  return {
    title: payload.title,
    description: payload.description,
    priority: payload.priority,
    dueDate: payload.dueDate,
    context: payload.context,
  };
}
