export type ActionPreviewField = {
  label: string;
  value: string;
};

export type ActionPreview = {
  actionLabel: string;
  fields: ActionPreviewField[];
  sourceLabel?: string;
  reason?: string;
};

export type ActionPreviewResult =
  | { success: true; preview: ActionPreview }
  | { success: false };

export type SafeActionResult = Record<string, unknown>;

export type ActionExecutionContext = {
  actionRequestId: string;
  userId: string;
};

export type ActionExecutionOutcome =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errorCode: "approval_execution_failed" | "action_unavailable" };

export type RegisteredActionExecutor<TPayload = unknown> = {
  actionType: string;
  riskLevel: "approval_required";
  validatePayload: (
    payload: unknown,
  ) =>
    | { success: true; payload: TPayload }
    | { success: false; errorCode: "invalid_action_payload" };
  buildPreview: (payload: TPayload) => ActionPreview;
  normalizePayloadForDedup: (payload: TPayload) => Record<string, unknown>;
  execute: (
    payload: TPayload,
    context: ActionExecutionContext,
  ) => Promise<ActionExecutionOutcome>;
  mapSafeResult: (
    payload: TPayload,
    executionData: Record<string, unknown>,
  ) => SafeActionResult;
  genericExecutionError: string;
};
