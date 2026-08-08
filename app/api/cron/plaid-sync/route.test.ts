import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  syncAllPlaidConnectionsForUserMock,
  createAutomationClientMock,
} = vi.hoisted(() => ({
  syncAllPlaidConnectionsForUserMock: vi.fn(),
  createAutomationClientMock: vi.fn(),
}));

vi.mock("@/lib/jarvis/integrations/plaid/plaid-sync-service", () => ({
  syncAllPlaidConnectionsForUser: syncAllPlaidConnectionsForUserMock,
}));

vi.mock("@/lib/supabase/automation", () => ({
  createAutomationClient: createAutomationClientMock,
}));

import { GET, dynamic, maxDuration } from "@/app/api/cron/plaid-sync/route";
import { syncAllPlaidConnectionsForUser } from "@/lib/jarvis/integrations/plaid/plaid-sync-service";
import type { PlaidConnectionSyncResult } from "@/lib/jarvis/integrations/plaid/plaid-types";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const CRON_SECRET = "test-cron-secret-value";

const ENV_KEYS = ["CRON_SECRET", "JARVIS_OWNER_USER_ID"] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as EnvSnapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function buildRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/plaid-sync", { headers });
}

function buildSuccessResult(
  overrides: Partial<PlaidConnectionSyncResult> = {},
): PlaidConnectionSyncResult {
  return {
    connectionId: CONNECTION_ID,
    status: "success",
    accountsCreated: 0,
    accountsUpdated: 0,
    transactionsAdded: 1,
    transactionsModified: 0,
    transactionsRemoved: 0,
    transactionsMatchedExisting: 0,
    transactionsReviewRequired: 0,
    rocketMoneyMappingsRemoved: 0,
    unclassifiedCount: 0,
    ...overrides,
  };
}

describe("plaid-sync cron route", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.JARVIS_OWNER_USER_ID = OWNER_ID;
    syncAllPlaidConnectionsForUserMock.mockReset();
    createAutomationClientMock.mockReset();
    createAutomationClientMock.mockReturnValue({ tag: "automation-client" });
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("accepts valid cron authorization and returns aggregate counts", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([
      buildSuccessResult({ transactionsAdded: 2 }),
    ]);

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("completed");
    expect(body.connectionsAttempted).toBe(1);
    expect(body.connectionsSucceeded).toBe(1);
    expect(body.transactionsAdded).toBe(2);
    expect(body.connectionId).toBeUndefined();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("missing_server_configuration");
    expect(syncAllPlaidConnectionsForUserMock).not.toHaveBeenCalled();
  });

  it("fails closed when Authorization is missing", async () => {
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(syncAllPlaidConnectionsForUserMock).not.toHaveBeenCalled();
  });

  it("fails closed when Authorization is invalid", async () => {
    const response = await GET(buildRequest("Bearer wrong-secret"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("uses server-configured owner user ID and automation client", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([]);

    await GET(buildRequest(`Bearer ${CRON_SECRET}`));

    expect(createAutomationClientMock).toHaveBeenCalledTimes(1);
    expect(syncAllPlaidConnectionsForUserMock).toHaveBeenCalledWith(
      { tag: "automation-client" },
      OWNER_ID,
    );
  });

  it("never accepts a request-controlled owner user ID", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([]);

    await GET(
      new Request("http://localhost/api/cron/plaid-sync?userId=99999999-9999-4999-8999-999999999999", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(syncAllPlaidConnectionsForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      OWNER_ID,
    );
  });

  it("returns safe success when there are no eligible connections", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([]);

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("no_eligible_connections");
    expect(body.connectionsAttempted).toBe(0);
  });

  it("delegates to the existing full sync service", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([buildSuccessResult()]);

    await GET(buildRequest(`Bearer ${CRON_SECRET}`));

    expect(syncAllPlaidConnectionsForUser).toBe(syncAllPlaidConnectionsForUserMock);
    expect(syncAllPlaidConnectionsForUserMock).toHaveBeenCalledTimes(1);
  });

  it("returns HTTP 200 with failed counts when one connection fails and another succeeds", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([
      buildSuccessResult({
        connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "error",
        errorCode: "sync_failed",
        transactionsAdded: 0,
      }),
      buildSuccessResult({
        connectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "success",
        transactionsAdded: 3,
      }),
    ]);

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connectionsFailed).toBe(1);
    expect(body.connectionsSucceeded).toBe(1);
    expect(body.transactionsAdded).toBe(3);
  });

  it("counts locked overlaps as skipped connections", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([
      buildSuccessResult({
        status: "error",
        errorCode: "sync_in_progress",
      }),
    ]);

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(body.connectionsSkippedLocked).toBe(1);
    expect(body.connectionsFailed).toBe(0);
  });

  it("returns scheduled_sync_failed on top-level execution failure", async () => {
    syncAllPlaidConnectionsForUserMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("scheduled_sync_failed");
    expect(JSON.stringify(body)).not.toContain("db unavailable");
  });

  it("does not expose private identifiers or financial data in the response", async () => {
    syncAllPlaidConnectionsForUserMock.mockResolvedValue([
      buildSuccessResult({
        transactionsAdded: 5,
        transactionsMatchedExisting: 2,
      }),
    ]);

    const response = await GET(buildRequest(`Bearer ${CRON_SECRET}`));
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain(CONNECTION_ID);
    expect(serialized).not.toContain(OWNER_ID);
    expect(serialized).not.toContain("Chase");
    expect(serialized).not.toContain("token");
  });

  it("is configured as uncached with a 60 second max duration", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(60);
  });
});

describe("plaid-sync cron schedule", () => {
  it("uses a valid once-daily Hobby cron expression at least two UTC hours before Morning Brief", () => {
    const vercelConfig = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    const plaidCron = vercelConfig.crons.find(
      (entry) => entry.path === "/api/cron/plaid-sync",
    );
    const morningBriefCron = vercelConfig.crons.find(
      (entry) => entry.path === "/api/cron/morning-brief",
    );

    expect(plaidCron).toEqual({
      path: "/api/cron/plaid-sync",
      schedule: "0 9 * * *",
    });
    expect(morningBriefCron).toEqual({
      path: "/api/cron/morning-brief",
      schedule: "0 11 * * *",
    });

    const plaidHour = Number.parseInt(plaidCron!.schedule.split(" ")[1] ?? "", 10);
    const morningBriefHour = Number.parseInt(
      morningBriefCron!.schedule.split(" ")[1] ?? "",
      10,
    );

    expect(plaidHour).toBeLessThanOrEqual(11);
    expect(morningBriefHour - plaidHour).toBeGreaterThanOrEqual(2);
    expect(Math.abs(morningBriefHour - plaidHour)).toBeGreaterThan(1);
  });

  it("schedules Morning Brief at 11:00 UTC so it is ready before a 6:30 AM America/Chicago wake-up", () => {
    const vercelConfig = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/morning-brief",
      schedule: "0 11 * * *",
    });
  });
});

describe("plaid manual sync availability", () => {
  it("keeps the manual Sync now route available", async () => {
    const module = await import("@/app/api/integrations/plaid/sync/route");
    expect(typeof module.POST).toBe("function");
  });
});
