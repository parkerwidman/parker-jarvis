import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimWhoopRefresh,
  completeWhoopRefresh,
  loadWhoopRuntimeConnectionByUserId,
  releaseWhoopRefreshClaim,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { WHOOP_OAUTH_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import { refreshWhoopTokenPair } from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import {
  getValidWhoopAccessToken,
  waitForWinnerRefreshCredentials,
  WHOOP_REFRESH_LOSER_MAX_WAIT_MS,
  WHOOP_REFRESH_WAIT_INTERVAL_MS,
  WHOOP_REFRESH_WAIT_MAX_ATTEMPTS,
} from "@/lib/jarvis/integrations/whoop/whoop-token-manager";
import {
  encryptWhoopAccessToken,
  encryptWhoopRefreshToken,
} from "@/lib/jarvis/integrations/whoop/whoop-token-crypto";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const TEST_ENCRYPTION_KEY = "aa".repeat(32);

const loadWhoopRuntimeConnectionByUserIdMock = vi.fn();
const claimWhoopRefreshMock = vi.fn();
const completeWhoopRefreshMock = vi.fn();
const releaseWhoopRefreshClaimMock = vi.fn();
const refreshWhoopTokenPairMock = vi.fn();
const markWhoopConnectionErrorMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-connection-tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-connection-tools")
  >("@/lib/jarvis/integrations/whoop/whoop-connection-tools");

  return {
    ...actual,
    loadWhoopRuntimeConnectionByUserId: (...args: unknown[]) =>
      loadWhoopRuntimeConnectionByUserIdMock(...args),
    claimWhoopRefresh: (...args: unknown[]) => claimWhoopRefreshMock(...args),
    completeWhoopRefresh: (...args: unknown[]) =>
      completeWhoopRefreshMock(...args),
    releaseWhoopRefreshClaim: (...args: unknown[]) =>
      releaseWhoopRefreshClaimMock(...args),
    markWhoopConnectionError: (...args: unknown[]) =>
      markWhoopConnectionErrorMock(...args),
  };
});

vi.mock("@/lib/jarvis/integrations/whoop/whoop-oauth-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-oauth-client")
  >("@/lib/jarvis/integrations/whoop/whoop-oauth-client");

  return {
    ...actual,
    refreshWhoopTokenPair: (...args: unknown[]) =>
      refreshWhoopTokenPairMock(...args),
  };
});

function buildRuntimeConnection(params: {
  expiresAt: string;
  tokenVersion?: number;
  accessToken?: string;
}) {
  return {
    connection: {
      id: CONNECTION_ID,
      user_id: USER_ID,
      whoop_user_id: 10129,
      status: "connected" as const,
      granted_scopes: ["offline"],
      access_token_expires_at: params.expiresAt,
      connected_at: "2026-08-11T00:00:00.000Z",
      disconnected_at: null,
      last_successful_sync_at: null,
      last_webhook_at: null,
      last_error_code: null,
      sync_in_progress_at: null,
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z",
    },
    credentials: {
      connection_id: CONNECTION_ID,
      encrypted_access_token: encryptWhoopAccessToken(
        params.accessToken ?? "access-current",
      ),
      encrypted_refresh_token: encryptWhoopRefreshToken("refresh-current"),
      encryption_version: 1,
      refresh_claim_id: null,
      refresh_claimed_at: null,
      token_version: params.tokenVersion ?? 1,
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z",
    },
  };
}

describe("WHOOP token manager", () => {
  beforeEach(() => {
    process.env.WHOOP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.WHOOP_TOKEN_ENCRYPTION_KEY;
  });

  it("bounds loser wait to roughly ten seconds", () => {
    expect(WHOOP_REFRESH_WAIT_MAX_ATTEMPTS).toBe(40);
    expect(WHOOP_REFRESH_WAIT_INTERVAL_MS).toBe(250);
    expect(WHOOP_REFRESH_LOSER_MAX_WAIT_MS).toBe(10_000);
  });

  it("lets a loser succeed when the winner finishes after more than two seconds", async () => {
    vi.useFakeTimers();

    const pendingConnection = buildRuntimeConnection({
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      tokenVersion: 3,
    });
    const winnerConnection = buildRuntimeConnection({
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      tokenVersion: 4,
      accessToken: "access-from-winner",
    });

    loadWhoopRuntimeConnectionByUserIdMock
      .mockResolvedValueOnce(pendingConnection)
      .mockImplementation(async () => pendingConnection);

    claimWhoopRefreshMock.mockResolvedValue({ claimed: false, tokenVersion: 3 });

    const tokenPromise = getValidWhoopAccessToken(USER_ID);

    await vi.advanceTimersByTimeAsync(3_000);
    loadWhoopRuntimeConnectionByUserIdMock.mockImplementation(
      async () => winnerConnection,
    );
    await vi.advanceTimersByTimeAsync(WHOOP_REFRESH_WAIT_INTERVAL_MS);

    await expect(tokenPromise).resolves.toEqual({
      success: true,
      accessToken: "access-from-winner",
    });
    expect(refreshWhoopTokenPairMock).not.toHaveBeenCalled();
  });

  it("never lets a loser call WHOOP refresh while waiting", async () => {
    vi.useFakeTimers();

    loadWhoopRuntimeConnectionByUserIdMock.mockResolvedValue(
      buildRuntimeConnection({
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        tokenVersion: 3,
      }),
    );
    claimWhoopRefreshMock.mockResolvedValue({ claimed: false, tokenVersion: 3 });

    const tokenPromise = getValidWhoopAccessToken(USER_ID);
    await vi.advanceTimersByTimeAsync(WHOOP_REFRESH_LOSER_MAX_WAIT_MS + 500);
    claimWhoopRefreshMock.mockResolvedValueOnce({
      claimed: false,
      tokenVersion: 3,
    });
    await vi.advanceTimersByTimeAsync(WHOOP_REFRESH_LOSER_MAX_WAIT_MS);

    const result = await tokenPromise;

    expect(result.success).toBe(false);
    expect(refreshWhoopTokenPairMock).not.toHaveBeenCalled();
  });

  it("returns a bounded retryable refresh error after wait timeout", async () => {
    vi.useFakeTimers();

    loadWhoopRuntimeConnectionByUserIdMock.mockResolvedValue(
      buildRuntimeConnection({
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        tokenVersion: 2,
      }),
    );
    claimWhoopRefreshMock.mockResolvedValue({ claimed: false, tokenVersion: 2 });

    const tokenPromise = getValidWhoopAccessToken(USER_ID);
    await vi.advanceTimersByTimeAsync(WHOOP_REFRESH_LOSER_MAX_WAIT_MS * 2 + 1_000);

    const result = await tokenPromise;

    expect(result).toEqual({
      success: false,
      error: WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed,
    });
  });

  it("refreshes near-expiry tokens and rotates both tokens", async () => {
    loadWhoopRuntimeConnectionByUserIdMock
      .mockResolvedValueOnce(
        buildRuntimeConnection({
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          tokenVersion: 2,
        }),
      )
      .mockResolvedValueOnce(
        buildRuntimeConnection({
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          tokenVersion: 2,
        }),
      );

    claimWhoopRefreshMock.mockResolvedValue({ claimed: true, tokenVersion: 2 });
    refreshWhoopTokenPairMock.mockResolvedValue({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresIn: 3600,
      grantedScopes: ["offline"],
      tokenType: "Bearer",
    });
    completeWhoopRefreshMock.mockResolvedValue({ tokenVersion: 3 });

    const result = await getValidWhoopAccessToken(USER_ID);

    expect(result).toEqual({ success: true, accessToken: "access-new" });
    expect(completeWhoopRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({
        priorTokenVersion: 2,
      }),
    );
  });

  it("releases claim and preserves credentials on refresh failure", async () => {
    loadWhoopRuntimeConnectionByUserIdMock
      .mockResolvedValueOnce(
        buildRuntimeConnection({
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          tokenVersion: 5,
        }),
      )
      .mockResolvedValueOnce(
        buildRuntimeConnection({
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          tokenVersion: 5,
        }),
      );

    claimWhoopRefreshMock.mockResolvedValue({ claimed: true, tokenVersion: 5 });
    refreshWhoopTokenPairMock.mockRejectedValue(new Error("refresh_failed"));
    markWhoopConnectionErrorMock.mockResolvedValue(undefined);

    const result = await getValidWhoopAccessToken(USER_ID);

    expect(result.success).toBe(false);
    expect(releaseWhoopRefreshClaimMock).toHaveBeenCalled();
    expect(completeWhoopRefreshMock).not.toHaveBeenCalled();
  });
});

describe("waitForWinnerRefreshCredentials", () => {
  beforeEach(() => {
    process.env.WHOOP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.WHOOP_TOKEN_ENCRYPTION_KEY;
  });

  it("returns null when no winner appears within the bounded wait", async () => {
    loadWhoopRuntimeConnectionByUserIdMock.mockResolvedValue(
      buildRuntimeConnection({
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        tokenVersion: 1,
      }),
    );

    const waitPromise = waitForWinnerRefreshCredentials({
      userId: USER_ID,
      priorTokenVersion: 1,
    });
    await vi.advanceTimersByTimeAsync(WHOOP_REFRESH_LOSER_MAX_WAIT_MS + 500);

    await expect(waitPromise).resolves.toBeNull();
  });
});
