import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CRON_SECRET = "cron-secret";
const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";

const authorizeCronRequestMock = vi.fn();
const resolveJarvisOwnerUserIdMock = vi.fn();
const runWhoopReconcileMock = vi.fn();

vi.mock("@/lib/cron/cron-auth", () => ({
  authorizeCronRequest: (...args: unknown[]) => authorizeCronRequestMock(...args),
  resolveJarvisOwnerUserId: (...args: unknown[]) =>
    resolveJarvisOwnerUserIdMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-reconcile-service", () => ({
  runWhoopReconcile: (...args: unknown[]) => runWhoopReconcileMock(...args),
}));

import { GET, dynamic, maxDuration, runtime } from "./route";

describe("WHOOP reconcile cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("JARVIS_OWNER_USER_ID", OWNER_USER_ID);
    authorizeCronRequestMock.mockReturnValue(true);
    resolveJarvisOwnerUserIdMock.mockReturnValue(OWNER_USER_ID);
    runWhoopReconcileMock.mockResolvedValue({
      ok: true,
      status: "synced",
      webhook_events_retried: 2,
    });
  });

  it("rejects missing cron auth", async () => {
    authorizeCronRequestMock.mockReturnValue(false);

    const response = await GET(
      new Request("http://localhost/api/cron/whoop-reconcile"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns a minimal safe success payload", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/whoop-reconcile", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "synced",
      webhook_events_retried: 2,
    });
    expect(runWhoopReconcileMock).toHaveBeenCalledWith(OWNER_USER_ID);
  });

  it("returns sanitized failure on unexpected errors", async () => {
    runWhoopReconcileMock.mockRejectedValue(new Error("boom"));

    const response = await GET(
      new Request("http://localhost/api/cron/whoop-reconcile", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "reconcile_failed",
    });
  });

  it("uses node runtime with a 300 second max duration", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });
});

describe("WHOOP reconcile cron schedule", () => {
  it("adds exactly one daily WHOOP reconcile cron at 13:00 UTC", () => {
    const vercelConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/plaid-sync",
      schedule: "0 9 * * *",
    });
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/morning-brief",
      schedule: "0 11 * * *",
    });
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/whoop-reconcile",
      schedule: "0 13 * * *",
    });

    const whoopCrons = vercelConfig.crons.filter((entry) =>
      entry.path.includes("whoop"),
    );
    expect(whoopCrons).toHaveLength(1);
  });
});
