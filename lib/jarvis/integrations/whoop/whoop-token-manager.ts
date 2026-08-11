import "server-only";

import { randomUUID } from "crypto";

import {
  WHOOP_ACCESS_TOKEN_REFRESH_WINDOW_MS,
  WHOOP_REFRESH_CLAIM_STALE_SECONDS,
  WHOOP_REFRESH_LOSER_MAX_WAIT_MS,
  WHOOP_REFRESH_WAIT_INTERVAL_MS,
  WHOOP_REFRESH_WAIT_MAX_ATTEMPTS,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import {
  claimWhoopRefresh,
  completeWhoopRefresh,
  loadWhoopRuntimeConnectionByUserId,
  markWhoopConnectionError,
  releaseWhoopRefreshClaim,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import {
  buildWhoopAccessTokenExpiryIso,
  refreshWhoopTokenPair,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import { WHOOP_OAUTH_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import {
  decryptWhoopAccessToken,
  decryptWhoopRefreshToken,
} from "@/lib/jarvis/integrations/whoop/whoop-token-crypto";

export type WhoopAccessTokenResult =
  | { success: true; accessToken: string }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

function accessTokenNeedsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiryTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expiryTime)) {
    return true;
  }

  return expiryTime <= Date.now() + WHOOP_ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readWinnerAccessToken(
  refreshed: NonNullable<Awaited<ReturnType<typeof loadWhoopRuntimeConnectionByUserId>>>,
  priorTokenVersion: number,
): WhoopAccessTokenResult | null {
  if (
    refreshed.connection.status !== "connected" ||
    refreshed.credentials.token_version <= priorTokenVersion ||
    accessTokenNeedsRefresh(refreshed.connection.access_token_expires_at)
  ) {
    return null;
  }

  try {
    return {
      success: true,
      accessToken: decryptWhoopAccessToken(
        refreshed.credentials.encrypted_access_token,
      ),
    };
  } catch {
    return { success: false, needsReconnect: true };
  }
}

/**
 * WHOOP rotates refresh tokens immediately on a successful refresh response.
 * If this serverless invocation dies after WHOOP accepts the refresh but before
 * `whoop_complete_refresh` persists the new pair, the stored refresh token may
 * become unusable and the user must reconnect through OAuth.
 */
export async function waitForWinnerRefreshCredentials(params: {
  userId: string;
  priorTokenVersion: number;
}): Promise<WhoopAccessTokenResult | null> {
  for (let attempt = 0; attempt < WHOOP_REFRESH_WAIT_MAX_ATTEMPTS; attempt += 1) {
    await sleep(WHOOP_REFRESH_WAIT_INTERVAL_MS);

    const refreshed = await loadWhoopRuntimeConnectionByUserId(params.userId);
    if (!refreshed) {
      continue;
    }

    const winnerResult = readWinnerAccessToken(
      refreshed,
      params.priorTokenVersion,
    );
    if (winnerResult) {
      return winnerResult;
    }
  }

  return null;
}

async function refreshWhoopAccessTokenWithClaim(
  params: {
    userId: string;
    connectionId: string;
    priorTokenVersion: number;
  },
  options?: { reclaimAttempt?: boolean },
): Promise<WhoopAccessTokenResult> {
  const claimId = randomUUID();
  let priorTokenVersion = params.priorTokenVersion;

  const claim = await claimWhoopRefresh({
    connectionId: params.connectionId,
    claimId,
    staleAfterSeconds: WHOOP_REFRESH_CLAIM_STALE_SECONDS,
  });

  if (!claim.claimed) {
    const winnerResult = await waitForWinnerRefreshCredentials({
      userId: params.userId,
      priorTokenVersion,
    });

    if (winnerResult) {
      return winnerResult;
    }

    if (!options?.reclaimAttempt) {
      return refreshWhoopAccessTokenWithClaim(params, { reclaimAttempt: true });
    }

    return {
      success: false,
      error: WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed,
    };
  }

  priorTokenVersion = claim.tokenVersion;

  const runtime = await loadWhoopRuntimeConnectionByUserId(params.userId);

  if (!runtime || runtime.connection.status !== "connected") {
    await releaseWhoopRefreshClaim({
      connectionId: params.connectionId,
      claimId,
    });
    return { success: false, needsConnection: true };
  }

  let refreshToken: string;

  try {
    refreshToken = decryptWhoopRefreshToken(
      runtime.credentials.encrypted_refresh_token,
    );
  } catch {
    await releaseWhoopRefreshClaim({
      connectionId: params.connectionId,
      claimId,
    });
    await markWhoopConnectionError({
      userId: params.userId,
      errorCode: "decryption_failed",
      status: "reconnect_required",
    });
    return { success: false, needsReconnect: true };
  }

  try {
    const tokenPair = await refreshWhoopTokenPair(refreshToken);
    const accessTokenExpiresAt = buildWhoopAccessTokenExpiryIso(
      tokenPair.expiresIn,
    );

    await completeWhoopRefresh({
      connectionId: params.connectionId,
      claimId,
      priorTokenVersion,
      accessTokenExpiresAt,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });

    return { success: true, accessToken: tokenPair.accessToken };
  } catch {
    await releaseWhoopRefreshClaim({
      connectionId: params.connectionId,
      claimId,
    });
    await markWhoopConnectionError({
      userId: params.userId,
      errorCode: "token_refresh_failed",
      status: "reconnect_required",
    });

    return {
      success: false,
      error: WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed,
    };
  }
}

export async function getValidWhoopAccessToken(
  userId: string,
): Promise<WhoopAccessTokenResult> {
  const runtime = await loadWhoopRuntimeConnectionByUserId(userId);

  if (!runtime || runtime.connection.status !== "connected") {
    return { success: false, needsConnection: true };
  }

  if (!accessTokenNeedsRefresh(runtime.connection.access_token_expires_at)) {
    try {
      return {
        success: true,
        accessToken: decryptWhoopAccessToken(
          runtime.credentials.encrypted_access_token,
        ),
      };
    } catch {
      return { success: false, needsReconnect: true };
    }
  }

  return refreshWhoopAccessTokenWithClaim({
    userId,
    connectionId: runtime.connection.id,
    priorTokenVersion: runtime.credentials.token_version,
  });
}

export {
  WHOOP_REFRESH_LOSER_MAX_WAIT_MS,
  WHOOP_REFRESH_WAIT_INTERVAL_MS,
  WHOOP_REFRESH_WAIT_MAX_ATTEMPTS,
};
