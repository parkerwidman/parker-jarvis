import "server-only";

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
