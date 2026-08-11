import "server-only";

import {
  disconnectWhoopConnection,
  loadWhoopConnectionMetadataByUserId,
  markWhoopRemoteRevokeCleanupPending,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { isWhoopRemoteRevokeCleanupPending } from "@/lib/jarvis/integrations/whoop/whoop-connection-errors";
import { revokeWhoopAccess } from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import { WHOOP_OAUTH_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import { getValidWhoopAccessToken } from "@/lib/jarvis/integrations/whoop/whoop-token-manager";

export const WHOOP_DISCONNECT_LOCAL_RETRY_ATTEMPTS = 3;
export const WHOOP_DISCONNECT_LOCAL_RETRY_DELAY_MS = 150;

export type WhoopDisconnectResult =
  | { ok: true; status: "disconnected" }
  | {
      ok: false;
      error: string;
      status?: "cleanup_pending" | "disconnected" | "error";
      httpStatus: number;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function finishWhoopLocalDisconnectWithRetries(
  userId: string,
): Promise<boolean> {
  for (
    let attempt = 0;
    attempt < WHOOP_DISCONNECT_LOCAL_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      await disconnectWhoopConnection(userId);
      return true;
    } catch {
      if (attempt < WHOOP_DISCONNECT_LOCAL_RETRY_ATTEMPTS - 1) {
        await sleep(WHOOP_DISCONNECT_LOCAL_RETRY_DELAY_MS);
      }
    }
  }

  return false;
}

export async function executeWhoopDisconnect(
  userId: string,
): Promise<WhoopDisconnectResult> {
  const metadata = await loadWhoopConnectionMetadataByUserId(userId);

  if (!metadata || metadata.status === "disconnected") {
    return {
      ok: false,
      error: WHOOP_OAUTH_ERROR_CODES.needsConnection,
      httpStatus: 400,
    };
  }

  if (isWhoopRemoteRevokeCleanupPending(metadata.last_error_code)) {
    const cleanedUp = await finishWhoopLocalDisconnectWithRetries(userId);

    if (cleanedUp) {
      return { ok: true, status: "disconnected" };
    }

    return {
      ok: false,
      error: WHOOP_OAUTH_ERROR_CODES.disconnectCleanupPending,
      status: "cleanup_pending",
      httpStatus: 503,
    };
  }

  const tokenResult = await getValidWhoopAccessToken(userId);

  if (!tokenResult.success) {
    return {
      ok: false,
      error: WHOOP_OAUTH_ERROR_CODES.disconnectRemoteFailed,
      httpStatus: 400,
    };
  }

  const revokeResult = await revokeWhoopAccess(tokenResult.accessToken);

  if (!revokeResult.success) {
    return {
      ok: false,
      error: WHOOP_OAUTH_ERROR_CODES.disconnectRemoteFailed,
      httpStatus: 502,
    };
  }

  await markWhoopRemoteRevokeCleanupPending(userId);

  const cleanedUp = await finishWhoopLocalDisconnectWithRetries(userId);

  if (cleanedUp) {
    return { ok: true, status: "disconnected" };
  }

  return {
    ok: false,
    error: WHOOP_OAUTH_ERROR_CODES.disconnectCleanupPending,
    status: "cleanup_pending",
    httpStatus: 503,
  };
}
