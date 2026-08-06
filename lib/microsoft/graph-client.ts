import "server-only";

import {
  classifyGraphSendFailure,
  type GraphSendFailureKind,
} from "@/lib/microsoft/graph-errors";
import {
  getValidMicrosoftAccessToken,
  type MicrosoftAccessTokenResult,
} from "@/lib/microsoft/token-manager";
import type { SupabaseClient } from "@supabase/supabase-js";

const GRAPH_BASE_URL = "https://graph.microsoft.com";

export type MicrosoftGraphResult =
  | { success: true; data: unknown }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

export type MicrosoftGraphDetailedResult =
  | { success: true; data: unknown }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string; failureKind: GraphSendFailureKind };

function isValidGraphPath(path: string): boolean {
  if (!path.startsWith("/v1.0/")) {
    return false;
  }

  if (/^https?:\/\//i.test(path)) {
    return false;
  }

  return true;
}

function mapTokenResult(
  result: MicrosoftAccessTokenResult,
): MicrosoftGraphResult | null {
  if (result.success) {
    return null;
  }

  if ("needsConnection" in result) {
    return { success: false, needsConnection: true };
  }

  if ("needsReconnect" in result) {
    return { success: false, needsReconnect: true };
  }

  return { success: false, error: result.error };
}

async function graphFetch(
  path: string,
  accessToken: string,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers,
    },
  });

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

async function graphFetchWithMethod(
  path: string,
  accessToken: string,
  method: "POST" | "PATCH",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();

  let data: unknown = null;

  if (responseText.length > 0) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }
  }

  return { ok: response.ok, status: response.status, data };
}

async function executeGraphRequestDetailed(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  fetchFn: (accessToken: string) => Promise<{
    ok: boolean;
    status: number;
    data: unknown;
  }>,
): Promise<MicrosoftGraphDetailedResult> {
  if (!isValidGraphPath(path)) {
    return { success: false, error: "Invalid Microsoft Graph path.", failureKind: "generic" };
  }

  const tokenResult = await getValidMicrosoftAccessToken(supabase, userId);

  const tokenError = mapTokenResult(tokenResult);
  if (tokenError) {
    if ("needsConnection" in tokenError) {
      return { success: false, needsConnection: true };
    }

    if ("needsReconnect" in tokenError) {
      return { success: false, needsReconnect: true };
    }

    return {
      success: false,
      error: "error" in tokenError ? tokenError.error : "Could not obtain Microsoft access token.",
      failureKind: "generic",
    };
  }

  if (!tokenResult.success) {
    return {
      success: false,
      error: "Could not obtain Microsoft access token.",
      failureKind: "generic",
    };
  }

  try {
    let result = await fetchFn(tokenResult.accessToken);

    if (result.status === 401) {
      const refreshResult = await getValidMicrosoftAccessToken(
        supabase,
        userId,
        true,
      );

      const refreshError = mapTokenResult(refreshResult);
      if (refreshError) {
        if ("needsConnection" in refreshError) {
          return { success: false, needsConnection: true };
        }

        if ("needsReconnect" in refreshError) {
          return { success: false, needsReconnect: true };
        }

        return {
          success: false,
          error:
            "error" in refreshError
              ? refreshError.error
              : "Could not obtain Microsoft access token.",
          failureKind: "generic",
        };
      }

      if (!refreshResult.success) {
        return {
          success: false,
          error: "Could not obtain Microsoft access token.",
          failureKind: "generic",
        };
      }

      result = await fetchFn(refreshResult.accessToken);
    }

    if (!result.ok) {
      return {
        success: false,
        error: "Microsoft Graph request failed.",
        failureKind: classifyGraphSendFailure(result.status, result.data),
      };
    }

    return { success: true, data: result.data };
  } catch {
    return {
      success: false,
      error: "Microsoft Graph request failed.",
      failureKind: "ambiguous",
    };
  }
}

async function executeGraphRequest(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  fetchFn: (accessToken: string) => Promise<{
    ok: boolean;
    status: number;
    data: unknown;
  }>,
): Promise<MicrosoftGraphResult> {
  if (!isValidGraphPath(path)) {
    return { success: false, error: "Invalid Microsoft Graph path." };
  }

  const tokenResult = await getValidMicrosoftAccessToken(supabase, userId);

  const tokenError = mapTokenResult(tokenResult);
  if (tokenError) {
    return tokenError;
  }

  if (!tokenResult.success) {
    return { success: false, error: "Could not obtain Microsoft access token." };
  }

  try {
    let result = await fetchFn(tokenResult.accessToken);

    if (result.status === 401) {
      const refreshResult = await getValidMicrosoftAccessToken(
        supabase,
        userId,
        true,
      );

      const refreshError = mapTokenResult(refreshResult);
      if (refreshError) {
        return refreshError;
      }

      if (!refreshResult.success) {
        return {
          success: false,
          error: "Could not obtain Microsoft access token.",
        };
      }

      result = await fetchFn(refreshResult.accessToken);
    }

    if (!result.ok) {
      return { success: false, error: "Microsoft Graph request failed." };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: "Microsoft Graph request failed." };
  }
}

export async function microsoftGraphGet(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  headers?: Record<string, string>,
): Promise<MicrosoftGraphResult> {
  if (!isValidGraphPath(path)) {
    return { success: false, error: "Invalid Microsoft Graph path." };
  }

  const tokenResult = await getValidMicrosoftAccessToken(supabase, userId);

  const tokenError = mapTokenResult(tokenResult);
  if (tokenError) {
    return tokenError;
  }

  if (!tokenResult.success) {
    return { success: false, error: "Could not obtain Microsoft access token." };
  }

  try {
    let result = await graphFetch(path, tokenResult.accessToken, headers);

    if (result.status === 401) {
      const refreshResult = await getValidMicrosoftAccessToken(
        supabase,
        userId,
        true,
      );

      const refreshError = mapTokenResult(refreshResult);
      if (refreshError) {
        return refreshError;
      }

      if (!refreshResult.success) {
        return {
          success: false,
          error: "Could not obtain Microsoft access token.",
        };
      }

      result = await graphFetch(path, refreshResult.accessToken, headers);
    }

    if (!result.ok) {
      return { success: false, error: "Microsoft Graph request failed." };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: "Microsoft Graph request failed." };
  }
}

export async function microsoftGraphPostDetailed(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<MicrosoftGraphDetailedResult> {
  return executeGraphRequestDetailed(supabase, userId, path, (accessToken) =>
    graphFetchWithMethod(path, accessToken, "POST", body, headers),
  );
}

export async function microsoftGraphPost(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<MicrosoftGraphResult> {
  return executeGraphRequest(supabase, userId, path, (accessToken) =>
    graphFetchWithMethod(path, accessToken, "POST", body, headers),
  );
}

export async function microsoftGraphPatch(
  supabase: SupabaseClient,
  userId: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<MicrosoftGraphResult> {
  return executeGraphRequest(supabase, userId, path, (accessToken) =>
    graphFetchWithMethod(path, accessToken, "PATCH", body, headers),
  );
}
