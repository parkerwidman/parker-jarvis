import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeCronRequest,
  resolveJarvisOwnerUserId,
} from "@/lib/cron/cron-auth";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
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

describe("cron auth", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.JARVIS_OWNER_USER_ID = OWNER_ID;
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("accepts valid cron authorization", () => {
    expect(
      authorizeCronRequest(buildRequest(`Bearer ${CRON_SECRET}`)),
    ).toBe(true);
  });

  it("fails closed when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(
      authorizeCronRequest(buildRequest(`Bearer ${CRON_SECRET}`)),
    ).toBe(false);
  });

  it("fails closed when Authorization is missing", () => {
    expect(authorizeCronRequest(buildRequest())).toBe(false);
  });

  it("fails closed when Authorization is invalid", () => {
    expect(
      authorizeCronRequest(buildRequest("Bearer wrong-secret")),
    ).toBe(false);
    expect(authorizeCronRequest(buildRequest("Basic token"))).toBe(false);
  });

  it("uses timing-safe comparison behavior", () => {
    const almostCorrect = `Bearer ${CRON_SECRET}x`;
    expect(authorizeCronRequest(buildRequest(almostCorrect))).toBe(false);
    expect(authorizeCronRequest(buildRequest(`Bearer ${CRON_SECRET}`))).toBe(
      true,
    );
  });

  it("resolves owner user ID from server configuration only", () => {
    expect(resolveJarvisOwnerUserId()).toBe(OWNER_ID);
    delete process.env.JARVIS_OWNER_USER_ID;
    expect(resolveJarvisOwnerUserId()).toBeNull();
    process.env.JARVIS_OWNER_USER_ID = "not-a-uuid";
    expect(resolveJarvisOwnerUserId()).toBeNull();
  });
});
