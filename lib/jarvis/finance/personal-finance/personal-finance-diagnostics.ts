export function buildPersonalFinanceToolDiagnosticPayload(
  toolName: string,
  output: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const payload: Record<string, unknown> = { toolName };

    if (typeof parsed.success === "boolean") {
      payload.success = parsed.success;
    }

    if (parsed.success === false && typeof parsed.error === "string") {
      payload.errorCode = parsed.error;
    }

    if (typeof parsed.transactionCount === "number") {
      payload.rowCount = parsed.transactionCount;
    } else if (Array.isArray(parsed.transactions)) {
      payload.rowCount = parsed.transactions.length;
    } else if (Array.isArray(parsed.recurringCharges)) {
      payload.rowCount = parsed.recurringCharges.length;
    } else if (Array.isArray(parsed.upcomingRecurringObligations)) {
      payload.rowCount = parsed.upcomingRecurringObligations.length;
    }

    if (typeof parsed.resultsLimited === "boolean") {
      payload.resultsLimited = parsed.resultsLimited;
    }

    return payload;
  } catch {
    return null;
  }
}

export const PERSONAL_FINANCE_TOOL_NAMES = [
  "get_personal_finance_summary",
  "get_personal_spending",
  "get_personal_recurring_charges",
] as const;

export function isPersonalFinanceToolName(toolName: string): boolean {
  return (PERSONAL_FINANCE_TOOL_NAMES as readonly string[]).includes(toolName);
}
