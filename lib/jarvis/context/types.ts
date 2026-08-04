export const JARVIS_CONTEXT_TYPES = ["task", "melusi_project"] as const;

export type JarvisContextType = (typeof JARVIS_CONTEXT_TYPES)[number];

export type JarvisContextTarget = {
  type: JarvisContextType;
  id: string;
};

export type JarvisContextInitial = JarvisContextTarget & {
  displayLabel: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isJarvisContextType(value: string): value is JarvisContextType {
  return (JARVIS_CONTEXT_TYPES as readonly string[]).includes(value);
}

export function parseJarvisContextTarget(
  type: unknown,
  id: unknown,
): JarvisContextTarget | null {
  if (typeof type !== "string" || typeof id !== "string") {
    return null;
  }

  if (!isJarvisContextType(type)) {
    return null;
  }

  const trimmedId = id.trim();

  if (!UUID_REGEX.test(trimmedId)) {
    return null;
  }

  return { type, id: trimmedId };
}

export function parseJarvisContextTargetFromBody(
  value: unknown,
): JarvisContextTarget | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { type?: unknown; id?: unknown };

  return parseJarvisContextTarget(record.type, record.id);
}

export function jarvisContextTypeLabel(type: JarvisContextType): string {
  switch (type) {
    case "task":
      return "Task selected";
    case "melusi_project":
      return "Melusi project selected";
  }
}
