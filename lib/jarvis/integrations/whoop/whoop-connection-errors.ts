/** Internal server-side connection error codes stored in whoop_connections.last_error_code. */
import { toWhoopSyncSafeUserMessage } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

export const WHOOP_CONNECTION_INTERNAL_ERROR_CODES = {
  remoteRevokeLocalCleanupPending: "remote_revoke_local_cleanup_pending",
} as const;

export type WhoopConnectionInternalErrorCode =
  (typeof WHOOP_CONNECTION_INTERNAL_ERROR_CODES)[keyof typeof WHOOP_CONNECTION_INTERNAL_ERROR_CODES];

export function isWhoopRemoteRevokeCleanupPending(
  lastErrorCode: string | null | undefined,
): boolean {
  return (
    lastErrorCode ===
    WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending
  );
}

export function toWhoopSafeLastErrorMessage(
  lastErrorCode: string | null | undefined,
): string | null {
  if (!lastErrorCode) {
    return null;
  }

  if (isWhoopRemoteRevokeCleanupPending(lastErrorCode)) {
    return "WHOOP access was revoked, but Jarvis still needs to finish disconnect cleanup. Try disconnect again.";
  }

  if (lastErrorCode.startsWith("whoop_sync_")) {
    return toWhoopSyncSafeUserMessage(
      lastErrorCode as Parameters<typeof toWhoopSyncSafeUserMessage>[0],
    );
  }

  if (
    lastErrorCode === "token_refresh_failed" ||
    lastErrorCode === "decryption_failed"
  ) {
    return "WHOOP connection needs to be reconnected.";
  }

  return "WHOOP connection needs attention.";
}

export function formatWhoopGrantedScopesDisplay(
  grantedScopes: string[],
  connected: boolean,
): string | null {
  if (grantedScopes.length > 0) {
    return grantedScopes.join(", ");
  }

  if (connected) {
    return "Provider did not report scopes";
  }

  return null;
}
