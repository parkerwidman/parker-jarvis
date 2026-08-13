const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_REGEX.test(value);
}

export function parseGoalTargetDateInput(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!isDateOnlyString(trimmed)) {
    return null;
  }

  return trimmed;
}

export function dateOnlyToUtcNoonIso(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`;
}

export function parseTaskDueDateInput(value: unknown): string | null {
  const dateOnly = parseGoalTargetDateInput(value);

  if (dateOnly === null) {
    return null;
  }

  return dateOnlyToUtcNoonIso(dateOnly);
}

export function formatGoalTargetDateLabel(targetDate: string | null): string | null {
  if (!targetDate) {
    return null;
  }

  return new Date(`${targetDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTaskDueDateLabel(dueAt: string | null): string | null {
  if (!dueAt) {
    return null;
  }

  return new Date(dueAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dueAtToDateInputValue(dueAt: string | null): string {
  if (!dueAt) {
    return "";
  }

  return new Date(dueAt).toISOString().slice(0, 10);
}
