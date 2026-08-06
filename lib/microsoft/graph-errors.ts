type GraphErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

const CONFIRMED_PERMISSION_DENIED_CODES = new Set([
  "ErrorAccessDenied",
  "Authorization_RequestDenied",
  "accessDenied",
  "AccessDenied",
]);

export type GraphSendFailureKind =
  | "permission_denied"
  | "auth_error"
  | "ambiguous"
  | "generic";

export function classifyGraphSendFailure(
  status: number,
  data: unknown,
): GraphSendFailureKind {
  if (status === 403 && isConfirmedGraphPermissionDenied(data)) {
    return "permission_denied";
  }

  if (status === 401) {
    return "auth_error";
  }

  if (status >= 500 || status === 408 || status === 429) {
    return "ambiguous";
  }

  if (status === 403) {
    return "ambiguous";
  }

  return "generic";
}

export function isConfirmedGraphPermissionDenied(data: unknown): boolean {
  const body = data as GraphErrorBody;
  const code = body?.error?.code;

  return typeof code === "string" && CONFIRMED_PERMISSION_DENIED_CODES.has(code);
}
