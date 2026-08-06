import "server-only";

import type { JarvisToolExecutionContext } from "@/lib/jarvis/agents/tool-execution-context";
import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
  ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  ACTION_TYPE_CREATE_TASK,
  ACTION_TYPE_SEND_OUTLOOK_EMAIL,
} from "./action-type-constants";

export type ActionRiskDecision =
  | "auto_execute"
  | "approval_required"
  | "forbidden";

export type WriteActionType =
  | typeof ACTION_TYPE_CREATE_TASK
  | typeof ACTION_TYPE_CREATE_OUTLOOK_REMINDER
  | typeof ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT
  | typeof ACTION_TYPE_CREATE_OUTLOOK_DRAFT
  | typeof ACTION_TYPE_SEND_OUTLOOK_EMAIL
  | "propose_task"
  | "propose_outlook_calendar_event";

const FINANCE_PLAID_WRITE_PATTERNS = [
  "finance",
  "plaid",
  "transfer",
  "payment",
  "dispute",
  "classification",
] as const;

export function isKnownWriteAction(actionType: string): actionType is WriteActionType {
  return (
    actionType === ACTION_TYPE_CREATE_TASK ||
    actionType === ACTION_TYPE_CREATE_OUTLOOK_REMINDER ||
    actionType === ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT ||
    actionType === ACTION_TYPE_CREATE_OUTLOOK_DRAFT ||
    actionType === ACTION_TYPE_SEND_OUTLOOK_EMAIL ||
    actionType === "propose_task" ||
    actionType === "propose_outlook_calendar_event"
  );
}

export function isFinanceOrPlaidWriteActionType(actionType: string): boolean {
  const normalized = actionType.toLowerCase();
  return FINANCE_PLAID_WRITE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

export function resolveActionRisk(
  actionType: string,
  context: JarvisToolExecutionContext,
): ActionRiskDecision {
  if (isFinanceOrPlaidWriteActionType(actionType)) {
    return "forbidden";
  }

  if (!isKnownWriteAction(actionType)) {
    return "forbidden";
  }

  if (actionType === "propose_task" || actionType === "propose_outlook_calendar_event") {
    return "approval_required";
  }

  if (context.agentKey === "melusi") {
    if (actionType === ACTION_TYPE_CREATE_TASK) {
      return "auto_execute";
    }
    return "forbidden";
  }

  if (context.agentKey === "main" && context.isInteractiveMainJarvisTurn) {
    return "auto_execute";
  }

  return "forbidden";
}

export function requireAutoExecutePolicy(
  actionType: string,
  context: JarvisToolExecutionContext,
):
  | { allowed: true }
  | { allowed: false; errorCode: string } {
  const decision = resolveActionRisk(actionType, context);

  if (decision === "auto_execute") {
    return { allowed: true };
  }

  if (decision === "approval_required") {
    return { allowed: false, errorCode: "action_forbidden" };
  }

  return { allowed: false, errorCode: "action_forbidden" };
}
