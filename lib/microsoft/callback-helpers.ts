import "server-only";

import { encryptToken } from "@/lib/microsoft/encryption";
import type { MicrosoftOAuthMode } from "@/lib/microsoft/oauth-state";

export type ExistingMicrosoftConnection = {
  granted_scopes: string;
  refresh_token_encrypted: string;
  microsoft_user_id: string;
};

export type RefreshTokenResolution =
  | { success: true; refreshTokenEncrypted: string; preservedExisting: boolean }
  | { success: false; reason: "encryption_failed" | "refresh_token_required" | "account_mismatch" };

export function resolveCallbackRefreshTokenEncrypted(params: {
  refreshToken: string | undefined;
  mode: MicrosoftOAuthMode;
  existingConnection: ExistingMicrosoftConnection | null;
  profileMicrosoftUserId: string;
}): RefreshTokenResolution {
  if (typeof params.refreshToken === "string") {
    try {
      return {
        success: true,
        refreshTokenEncrypted: encryptToken(params.refreshToken),
        preservedExisting: false,
      };
    } catch {
      return { success: false, reason: "encryption_failed" };
    }
  }

  if (params.mode !== "reconnect" || !params.existingConnection) {
    return { success: false, reason: "refresh_token_required" };
  }

  if (params.existingConnection.microsoft_user_id !== params.profileMicrosoftUserId) {
    return { success: false, reason: "account_mismatch" };
  }

  return {
    success: true,
    refreshTokenEncrypted: params.existingConnection.refresh_token_encrypted,
    preservedExisting: true,
  };
}
