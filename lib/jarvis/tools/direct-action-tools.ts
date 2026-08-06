import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisToolExecutionContext } from "@/lib/jarvis/agents/tool-execution-context";
import { requireAutoExecutePolicy } from "@/lib/jarvis/action-requests/action-risk-policy";
import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
  ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  ACTION_TYPE_CREATE_TASK,
  ACTION_TYPE_SEND_OUTLOOK_EMAIL,
} from "@/lib/jarvis/action-requests/action-type-constants";
import {
  buildIdempotencyKey,
  claimAutoExecuteAction,
  completeAutoExecuteAction,
  failAutoExecuteAction,
  mapAutoExecuteClaimFailure,
} from "@/lib/jarvis/action-requests/auto-execute-audit";
import type { ValidatedDraftPayload } from "@/lib/jarvis/action-requests/draft-action-payload";
import {
  buildDirectCalendarSummary,
  validateDirectCalendarEventPayload,
} from "@/lib/jarvis/action-requests/direct-calendar-action-payload";
import {
  buildDraftSummary,
  validateDraftPayload,
} from "@/lib/jarvis/action-requests/draft-action-payload";
import {
  buildEmailSendSummary,
  validateEmailSendPayload,
} from "@/lib/jarvis/action-requests/email-send-action-payload";
import {
  buildReminderSummary,
  validateReminderPayload,
} from "@/lib/jarvis/action-requests/reminder-action-payload";
import {
  buildTaskNotes,
  validateTaskProposalInput,
} from "@/lib/jarvis/action-requests/task-action-payload";
import {
  createOutlookCalendarEventDirect,
  createOutlookDraft,
  createOutlookReminder,
  sendOutlookEmail,
} from "@/lib/jarvis/tools/microsoft-tools";
import {
  findOutlookDraftReferenceByActionRequest,
  logOutlookDraftStageDiagnostic,
} from "@/lib/jarvis/tools/outlook-draft-references";
import { createTask } from "@/lib/jarvis/tools/task-tools";

type SafeToolError = {
  success: false;
  errorCode: string;
  message?: string;
  clarificationRequired?: true;
  needsConnection?: true;
  needsReconnect?: true;
  microsoftPermissionRequired?: true;
  requiredPermission?: string;
  emailSendOutcomeUncertain?: true;
  draftCreationOutcomeUncertain?: true;
};

type SafeTaskResult = {
  success: true;
  status: "completed";
  title: string;
  priority: string;
  dueDate: string | null;
};

export async function executeDirectCreateTask(
  supabase: SupabaseClient,
  userId: string,
  executionContext: JarvisToolExecutionContext,
  input: {
    title: string;
    description?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    context?: string | null;
    lifeAreaModuleKey?: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<SafeTaskResult | SafeToolError> {
  const policy = requireAutoExecutePolicy(
    ACTION_TYPE_CREATE_TASK,
    executionContext,
  );

  if (!policy.allowed) {
    return { success: false, errorCode: policy.errorCode };
  }

  const validated = validateTaskProposalInput({
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate,
    context: input.context,
  });

  if (!validated.success) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const idempotencyKey = buildIdempotencyKey(
    executionContext.toolCallId,
    ACTION_TYPE_CREATE_TASK,
  );

  const claim = await claimAutoExecuteAction(supabase, {
    userId,
    actionType: ACTION_TYPE_CREATE_TASK,
    idempotencyKey,
    title: "Create task",
    summary: validated.payload.title,
    payload: {
      title: validated.payload.title,
      priority: validated.payload.priority,
      dueDate: validated.payload.dueDate,
    },
  });

  if (!claim.success) {
    return mapAutoExecuteClaimFailure(claim.errorCode, "task_creation_failed");
  }

  if (claim.isReplay) {
    return mapStoredTaskResult(claim.priorResult);
  }

  const notes = buildTaskNotes(validated.payload) ?? undefined;

  const result = await createTask(supabase, userId, {
    title: validated.payload.title,
    priority: validated.payload.priority,
    dueDate: validated.payload.dueDate ?? undefined,
    notes,
    lifeAreaModuleKey: input.lifeAreaModuleKey,
    projectId: input.projectId,
    projectName: input.projectName,
  });

  if (!result.success) {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Task creation failed.",
    });
    return { success: false, errorCode: "task_creation_failed" };
  }

  const safeResult: SafeTaskResult = {
    success: true,
    status: "completed",
    title: validated.payload.title,
    priority: validated.payload.priority,
    dueDate: validated.payload.dueDate,
  };

  await completeAutoExecuteAction(supabase, {
    auditId: claim.auditId,
    userId,
    result: safeResult,
  });

  return safeResult;
}

function mapStoredTaskResult(
  stored: Record<string, unknown>,
): SafeTaskResult | SafeToolError {
  if (stored.success !== true) {
    return { success: false, errorCode: "task_creation_failed" };
  }

  return {
    success: true,
    status: "completed",
    title: typeof stored.title === "string" ? stored.title : "",
    priority: typeof stored.priority === "string" ? stored.priority : "medium",
    dueDate: typeof stored.dueDate === "string" ? stored.dueDate : null,
  };
}

export async function executeDirectCreateReminder(
  supabase: SupabaseClient,
  userId: string,
  executionContext: JarvisToolExecutionContext,
  input: {
    title: string;
    remindAt: string;
    timeZone: string;
    notes?: string | null;
    durationMinutes?: number | null;
    reminderMinutesBeforeStart?: number | null;
  },
): Promise<
  | {
      success: true;
      status: "completed";
      title: string;
      remindAt: string;
      timeZone: string;
    }
  | SafeToolError
> {
  const policy = requireAutoExecutePolicy(
    ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
    executionContext,
  );

  if (!policy.allowed) {
    return { success: false, errorCode: policy.errorCode };
  }

  const validated = validateReminderPayload({
    title: input.title,
    remindAt: input.remindAt,
    timeZone: input.timeZone,
    notes: input.notes ?? null,
    durationMinutes: input.durationMinutes ?? null,
    reminderMinutesBeforeStart: input.reminderMinutesBeforeStart ?? null,
  });

  if (!validated.success) {
    if (validated.errorCode === "clarification_required") {
      return {
        success: false,
        errorCode: "clarification_required",
        clarificationRequired: true,
        message: "The reminder time is ambiguous in that timezone. Please clarify the exact local time.",
      };
    }

    return { success: false, errorCode: "invalid_action_payload" };
  }

  const idempotencyKey = buildIdempotencyKey(
    executionContext.toolCallId,
    ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
  );

  const claim = await claimAutoExecuteAction(supabase, {
    userId,
    actionType: ACTION_TYPE_CREATE_OUTLOOK_REMINDER,
    idempotencyKey,
    title: "Create Outlook reminder",
    summary: buildReminderSummary(validated.payload),
    payload: {
      title: validated.payload.title,
      remindAt: validated.payload.remindAt,
      timeZone: validated.payload.timeZone,
    },
  });

  if (!claim.success) {
    return mapAutoExecuteClaimFailure(claim.errorCode, "reminder_creation_failed");
  }

  if (claim.isReplay) {
    return mapStoredReminderResult(claim.priorResult);
  }

  const graphResult = await createOutlookReminder(supabase, userId, {
    transactionId: claim.auditId,
    payload: validated.payload,
  });

  if (!graphResult.success) {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Reminder creation failed.",
    });

    return mapMicrosoftFailure(graphResult, "reminder_creation_failed");
  }

  const safeResult = {
    success: true as const,
    status: "completed" as const,
    title: validated.payload.title,
    remindAt: validated.payload.remindAt,
    timeZone: validated.payload.timeZone,
  };

  await completeAutoExecuteAction(supabase, {
    auditId: claim.auditId,
    userId,
    result: safeResult,
  });

  return safeResult;
}

function mapStoredReminderResult(
  stored: Record<string, unknown>,
):
  | {
      success: true;
      status: "completed";
      title: string;
      remindAt: string;
      timeZone: string;
    }
  | SafeToolError {
  if (stored.success !== true) {
    return { success: false, errorCode: "reminder_creation_failed" };
  }

  return {
    success: true,
    status: "completed",
    title: typeof stored.title === "string" ? stored.title : "",
    remindAt: typeof stored.remindAt === "string" ? stored.remindAt : "",
    timeZone: typeof stored.timeZone === "string" ? stored.timeZone : "",
  };
}

export async function executeDirectCreateCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  executionContext: JarvisToolExecutionContext,
  input: {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    timeZone: string;
    locationName?: string | null;
    notes?: string | null;
    attendees?: string[] | null;
  },
): Promise<
  | {
      success: true;
      status: "completed";
      subject: string;
      startDateTime: string;
      endDateTime: string;
      timeZone: string;
      attendeeCount: number;
    }
  | SafeToolError
> {
  const policy = requireAutoExecutePolicy(
    ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
    executionContext,
  );

  if (!policy.allowed) {
    return { success: false, errorCode: policy.errorCode };
  }

  const validated = validateDirectCalendarEventPayload({
    subject: input.subject,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    timeZone: input.timeZone,
    locationName: input.locationName ?? null,
    notes: input.notes ?? null,
    attendees: input.attendees ?? null,
  });

  if (!validated.success) {
    if (validated.errorCode === "clarification_required") {
      return {
        success: false,
        errorCode: "clarification_required",
        clarificationRequired: true,
        message: "Attendee identity or event timing is ambiguous. Please clarify.",
      };
    }

    return { success: false, errorCode: "invalid_action_payload" };
  }

  const idempotencyKey = buildIdempotencyKey(
    executionContext.toolCallId,
    ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  );

  const claim = await claimAutoExecuteAction(supabase, {
    userId,
    actionType: ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
    idempotencyKey,
    title: "Create Outlook calendar event",
    summary: buildDirectCalendarSummary(validated.payload),
    payload: {
      subject: validated.payload.subject,
      startDateTime: validated.payload.startDateTime,
      endDateTime: validated.payload.endDateTime,
      timeZone: validated.payload.timeZone,
      attendeeCount: validated.payload.attendees.length,
    },
  });

  if (!claim.success) {
    return mapAutoExecuteClaimFailure(claim.errorCode, "calendar_creation_failed");
  }

  if (claim.isReplay) {
    return mapStoredCalendarResult(claim.priorResult);
  }

  const graphResult = await createOutlookCalendarEventDirect(supabase, userId, {
    transactionId: claim.auditId,
    payload: validated.payload,
  });

  if (!graphResult.success) {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Calendar event creation failed.",
    });

    return mapMicrosoftFailure(graphResult, "calendar_creation_failed");
  }

  const safeResult = {
    success: true as const,
    status: "completed" as const,
    subject: validated.payload.subject,
    startDateTime: validated.payload.startDateTime,
    endDateTime: validated.payload.endDateTime,
    timeZone: validated.payload.timeZone,
    attendeeCount: validated.payload.attendees.length,
  };

  await completeAutoExecuteAction(supabase, {
    auditId: claim.auditId,
    userId,
    result: safeResult,
  });

  return safeResult;
}

function mapStoredCalendarResult(
  stored: Record<string, unknown>,
):
  | {
      success: true;
      status: "completed";
      subject: string;
      startDateTime: string;
      endDateTime: string;
      timeZone: string;
      attendeeCount: number;
    }
  | SafeToolError {
  if (stored.success !== true) {
    return { success: false, errorCode: "calendar_creation_failed" };
  }

  return {
    success: true,
    status: "completed",
    subject: typeof stored.subject === "string" ? stored.subject : "",
    startDateTime:
      typeof stored.startDateTime === "string" ? stored.startDateTime : "",
    endDateTime:
      typeof stored.endDateTime === "string" ? stored.endDateTime : "",
    timeZone: typeof stored.timeZone === "string" ? stored.timeZone : "",
    attendeeCount:
      typeof stored.attendeeCount === "number" ? stored.attendeeCount : 0,
  };
}

export async function executeDirectCreateDraft(
  supabase: SupabaseClient,
  userId: string,
  executionContext: JarvisToolExecutionContext,
  input: {
    toRecipients: string[];
    ccRecipients: string[];
    subject: string;
    body: string;
  },
): Promise<
  | {
      success: true;
      status: "completed";
      subject: string;
      toRecipientCount: number;
      ccRecipientCount: number;
      draftKey: string;
      savedToDrafts: true;
      notSent: true;
      message: string;
    }
  | SafeToolError
> {
  const policy = requireAutoExecutePolicy(
    ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
    executionContext,
  );

  if (!policy.allowed) {
    return { success: false, errorCode: policy.errorCode };
  }

  const validated = validateDraftPayload({
    toRecipients: input.toRecipients,
    ccRecipients: input.ccRecipients,
    subject: input.subject,
    body: input.body,
  });

  if (!validated.success) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const idempotencyKey = buildIdempotencyKey(
    executionContext.toolCallId,
    ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
  );

  const claim = await claimAutoExecuteAction(supabase, {
    userId,
    actionType: ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
    idempotencyKey,
    title: "Create Outlook draft",
    summary: buildDraftSummary(validated.payload),
    payload: {
      subject: validated.payload.subject,
      toRecipientCount: validated.payload.toRecipients.length,
      ccRecipientCount: validated.payload.ccRecipients.length,
    },
  });

  if (!claim.success) {
    return mapAutoExecuteClaimFailure(claim.errorCode, "draft_creation_failed");
  }

  if (claim.isReplay) {
    if (claim.providerOutcomeCertainty === "uncertain") {
      return reconcileUncertainDraftExecution(
        supabase,
        userId,
        claim.auditId,
        validated.payload,
      );
    }

    return mapStoredDraftResult(claim.priorResult);
  }

  const graphResult = await createOutlookDraft(
    supabase,
    userId,
    {
      ...validated.payload,
      actionRequestId: claim.auditId,
    },
  );

  if ("outcome" in graphResult && graphResult.outcome === "uncertain") {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Draft creation outcome uncertain.",
      providerOutcomeCertainty: "uncertain",
    });

    return {
      success: false,
      errorCode: "draft_creation_outcome_uncertain",
      draftCreationOutcomeUncertain: true,
      message:
        "The draft outcome is uncertain. Do not claim the draft was saved or retry automatically.",
    };
  }

  if (!graphResult.success) {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Draft creation failed.",
      providerOutcomeCertainty: "failed_before_send",
    });

    return mapMicrosoftDraftFailure(graphResult);
  }

  const safeResult = buildSafeDraftResult(validated.payload, graphResult.draftKey);

  const auditCompleted = await completeAutoExecuteAction(supabase, {
    auditId: claim.auditId,
    userId,
    result: safeResult,
    providerOutcomeCertainty: "confirmed",
  });

  logOutlookDraftStageDiagnostic({
    stage: "draft_audit_completion",
    success: auditCompleted.success,
    ...(auditCompleted.success
      ? {}
      : { errorCode: "draft_audit_completion_failed" }),
  });

  if (!auditCompleted.success) {
    const reconciled = await reconcileUncertainDraftExecution(
      supabase,
      userId,
      claim.auditId,
      validated.payload,
    );

    if (reconciled.success) {
      return reconciled;
    }
  }

  return safeResult;
}

type SafeDraftResult = {
  success: true;
  status: "completed";
  subject: string;
  toRecipientCount: number;
  ccRecipientCount: number;
  draftKey: string;
  savedToDrafts: true;
  notSent: true;
  message: string;
};

function buildSafeDraftResult(
  payload: ValidatedDraftPayload,
  draftKey: string,
): SafeDraftResult {
  return {
    success: true,
    status: "completed",
    subject: payload.subject,
    toRecipientCount: payload.toRecipients.length,
    ccRecipientCount: payload.ccRecipients.length,
    draftKey,
    savedToDrafts: true,
    notSent: true,
    message: "The message was saved as a draft in Outlook and was not sent.",
  };
}

async function reconcileUncertainDraftExecution(
  supabase: SupabaseClient,
  userId: string,
  auditId: string,
  payload: ValidatedDraftPayload,
): Promise<SafeDraftResult | SafeToolError> {
  const existingReference = await findOutlookDraftReferenceByActionRequest(
    supabase,
    userId,
    auditId,
  );

  logOutlookDraftStageDiagnostic({
    stage: "draft_reconciliation",
    success: existingReference.success,
    existingReferenceFound: existingReference.success,
    ...(existingReference.success
      ? {}
      : { errorCode: "draft_creation_outcome_uncertain" }),
  });

  if (!existingReference.success) {
    return {
      success: false,
      errorCode: "draft_creation_outcome_uncertain",
      draftCreationOutcomeUncertain: true,
      message:
        "Outlook may have created the draft, but the outcome is uncertain and I can't confirm it was saved. Do not retry automatically.",
    };
  }

  const safeResult = buildSafeDraftResult(payload, existingReference.reference.id);

  const auditCompleted = await completeAutoExecuteAction(supabase, {
    auditId,
    userId,
    result: safeResult,
    providerOutcomeCertainty: "confirmed",
  });

  logOutlookDraftStageDiagnostic({
    stage: "draft_audit_completion",
    success: auditCompleted.success,
    existingReferenceFound: true,
    ...(auditCompleted.success
      ? {}
      : { errorCode: "draft_audit_completion_failed" }),
  });

  if (!auditCompleted.success) {
    return safeResult;
  }

  return safeResult;
}

function mapStoredDraftResult(
  stored: Record<string, unknown>,
):
  | {
      success: true;
      status: "completed";
      subject: string;
      toRecipientCount: number;
      ccRecipientCount: number;
      draftKey: string;
      savedToDrafts: true;
      notSent: true;
      message: string;
    }
  | SafeToolError {
  if (stored.success !== true) {
    return { success: false, errorCode: "draft_creation_failed" };
  }

  return {
    success: true,
    status: "completed",
    subject: typeof stored.subject === "string" ? stored.subject : "",
    toRecipientCount:
      typeof stored.toRecipientCount === "number" ? stored.toRecipientCount : 0,
    ccRecipientCount:
      typeof stored.ccRecipientCount === "number" ? stored.ccRecipientCount : 0,
    draftKey: typeof stored.draftKey === "string" ? stored.draftKey : "",
    savedToDrafts: true,
    notSent: true,
    message:
      typeof stored.message === "string"
        ? stored.message
        : "The message was saved as a draft in Outlook and was not sent.",
  };
}

function mapMicrosoftDraftFailure(result: {
  success: false;
  needsConnection?: true;
  needsReconnect?: true;
  microsoftPermissionRequired?: true;
  requiredPermission?: string;
}): SafeToolError {
  return mapMicrosoftFailure(result, "draft_creation_failed");
}

export async function executeDirectSendEmail(
  supabase: SupabaseClient,
  userId: string,
  executionContext: JarvisToolExecutionContext,
  input: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType?: "text" | "html" | null;
    draftKey?: string | null;
  },
): Promise<
  | {
      success: true;
      status: "completed";
      subject: string;
      recipientCount: number;
    }
  | SafeToolError
> {
  const policy = requireAutoExecutePolicy(
    ACTION_TYPE_SEND_OUTLOOK_EMAIL,
    executionContext,
  );

  if (!policy.allowed) {
    return { success: false, errorCode: policy.errorCode };
  }

  const validated = validateEmailSendPayload({
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    body: input.body,
    bodyType: input.bodyType ?? "text",
    draftKey: input.draftKey ?? null,
  });

  if (!validated.success) {
    if (validated.errorCode === "unsupported_bulk_action") {
      return { success: false, errorCode: "unsupported_bulk_action" };
    }

    return { success: false, errorCode: "invalid_action_payload" };
  }

  const idempotencyKey = buildIdempotencyKey(
    executionContext.toolCallId,
    ACTION_TYPE_SEND_OUTLOOK_EMAIL,
  );

  const claim = await claimAutoExecuteAction(supabase, {
    userId,
    actionType: ACTION_TYPE_SEND_OUTLOOK_EMAIL,
    idempotencyKey,
    title: "Send Outlook email",
    summary: buildEmailSendSummary(validated.payload),
    payload: {
      recipientCount:
        validated.payload.to.length +
        validated.payload.cc.length +
        validated.payload.bcc.length,
      subject: validated.payload.subject,
    },
  });

  if (!claim.success) {
    return mapAutoExecuteClaimFailure(claim.errorCode, "email_send_failed");
  }

  if (claim.isReplay) {
    if (claim.providerOutcomeCertainty === "uncertain") {
      return {
        success: false,
        errorCode: "email_send_outcome_uncertain",
        emailSendOutcomeUncertain: true,
        message: "A prior send attempt had an uncertain outcome. Do not retry automatically.",
      };
    }

    return mapStoredEmailResult(claim.priorResult);
  }

  const graphResult = await sendOutlookEmail(supabase, userId, {
    payload: validated.payload,
  });

  if ("outcome" in graphResult && graphResult.outcome === "uncertain") {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Email send outcome uncertain.",
      providerOutcomeCertainty: "uncertain",
    });

    return {
      success: false,
      errorCode: "email_send_outcome_uncertain",
      emailSendOutcomeUncertain: true,
      message: "The send outcome is uncertain. Do not claim the email was sent or retry automatically.",
    };
  }

  if (!graphResult.success) {
    await failAutoExecuteAction(supabase, {
      auditId: claim.auditId,
      userId,
      safeErrorMessage: "Email send failed.",
      providerOutcomeCertainty: "failed_before_send",
    });

    return mapMicrosoftSendFailure(graphResult);
  }

  const safeResult = {
    success: true as const,
    status: "completed" as const,
    subject: validated.payload.subject,
    recipientCount:
      validated.payload.to.length +
      validated.payload.cc.length +
      validated.payload.bcc.length,
  };

  await completeAutoExecuteAction(supabase, {
    auditId: claim.auditId,
    userId,
    result: safeResult,
    providerOutcomeCertainty: "confirmed",
  });

  return safeResult;
}

function mapStoredEmailResult(
  stored: Record<string, unknown>,
):
  | {
      success: true;
      status: "completed";
      subject: string;
      recipientCount: number;
    }
  | SafeToolError {
  if (stored.success !== true) {
    return { success: false, errorCode: "email_send_failed" };
  }

  return {
    success: true,
    status: "completed",
    subject: typeof stored.subject === "string" ? stored.subject : "",
    recipientCount:
      typeof stored.recipientCount === "number" ? stored.recipientCount : 0,
  };
}

function mapMicrosoftFailure(
  result: {
    success: false;
    needsConnection?: true;
    needsReconnect?: true;
    microsoftPermissionRequired?: true;
    requiredPermission?: string;
    error?: string;
  },
  defaultCode: string,
): SafeToolError {
  if ("needsConnection" in result && result.needsConnection) {
    return {
      success: false,
      errorCode: "microsoft_not_connected",
      needsConnection: true,
    };
  }

  if ("needsReconnect" in result && result.needsReconnect) {
    return {
      success: false,
      errorCode: "microsoft_not_connected",
      needsReconnect: true,
    };
  }

  if (
    "microsoftPermissionRequired" in result &&
    result.microsoftPermissionRequired
  ) {
    return {
      success: false,
      errorCode: "microsoft_permission_required",
      microsoftPermissionRequired: true,
      requiredPermission: result.requiredPermission,
    };
  }

  return { success: false, errorCode: defaultCode };
}

function mapMicrosoftSendFailure(result: {
  success: false;
  needsConnection?: true;
  needsReconnect?: true;
  microsoftPermissionRequired?: true;
  requiredPermission?: string;
}): SafeToolError {
  return mapMicrosoftFailure(result, "email_send_failed");
}
