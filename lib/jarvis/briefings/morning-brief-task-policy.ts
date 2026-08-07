export type MorningBriefTaskMetadata = {
  title: string;
  notes?: string | null;
  lifeAreaName?: string | null;
  projectId?: string | null;
};

const INTERNAL_TECHNICAL_PATTERN =
  /\b(?:reconnect(?:ing)?\s+(?:microsoft|outlook|plaid|jarvis)|jarvis\s+setup|fix(?:ing)?\s+jarvis|approval\s+workflow|plaid\s+(?:setup|intro|sync|test(?:ing)?)|oauth|cron(?:\s+job)?|deploy(?:ment)?|migration|integration(?:\s+test)?|connection\s+test|api\s+test|debug(?:ging)?|test(?:ing)?\s+(?:approval|workflow|plaid|oauth|cron|integration|connection|microsoft|outlook))\b/i;

export function normalizeMorningBriefFocusValue(
  value: string | null | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

export function taskMatchesCurrentFocus(
  taskTitle: string,
  currentFocus: string | null | undefined,
): boolean {
  const normalizedFocus = normalizeMorningBriefFocusValue(currentFocus);

  if (!normalizedFocus) {
    return false;
  }

  return taskTitle.trim().toLowerCase() === normalizedFocus;
}

export function isInternalMorningBriefTask(
  input: MorningBriefTaskMetadata,
): boolean {
  const haystack = [
    input.title,
    input.notes ?? "",
    input.lifeAreaName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return INTERNAL_TECHNICAL_PATTERN.test(haystack);
}

export function shouldIncludeTaskInMorningBriefSelection(
  input: MorningBriefTaskMetadata,
  currentFocus: string | null | undefined,
): boolean {
  if (taskMatchesCurrentFocus(input.title, currentFocus)) {
    return true;
  }

  return !isInternalMorningBriefTask(input);
}

export function isMeaningfulMorningBriefDeadlineTask(input: {
  title: string;
  priority: string;
  overdue: boolean;
  dueToday: boolean;
  notes?: string | null;
  lifeAreaName?: string | null;
  projectId?: string | null;
  currentFocus: string | null | undefined;
}): boolean {
  if (
    !shouldIncludeTaskInMorningBriefSelection(
      {
        title: input.title,
        notes: input.notes,
        lifeAreaName: input.lifeAreaName,
        projectId: input.projectId,
      },
      input.currentFocus,
    )
  ) {
    return false;
  }

  if (input.priority !== "high") {
    return false;
  }

  return input.overdue || input.dueToday;
}
