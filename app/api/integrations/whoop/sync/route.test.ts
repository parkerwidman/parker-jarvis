import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as syncPOST, maxDuration } from "@/app/api/integrations/whoop/sync/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const getClaimsMock = vi.fn();
const syncWhoopFitnessDataMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-sync-service", () => ({
  syncWhoopFitnessData: (...args: unknown[]) => syncWhoopFitnessDataMock(...args),
}));

function buildAuthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
}

function buildUnauthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: null },
    error: new Error("unauthorized"),
  });
}

describe("WHOOP sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports maxDuration=300 for first-sync headroom", () => {
    expect(maxDuration).toBe(300);
  });

  it("requires authentication", async () => {
    buildUnauthenticatedClaims();

    const response = await syncPOST(
      new NextRequest("http://localhost/api/integrations/whoop/sync", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(syncWhoopFitnessDataMock).not.toHaveBeenCalled();
  });

  it("derives userId from session and returns safe summary only", async () => {
    buildAuthenticatedClaims();
    syncWhoopFitnessDataMock.mockResolvedValue({
      ok: true,
      summary: {
        cycles: 90,
        recoveries: 90,
        sleeps: 93,
        workouts: 34,
        bodyMeasurement: true,
        syncedAt: "2026-08-11T12:00:00.000Z",
      },
    });

    const response = await syncPOST(
      new NextRequest("http://localhost/api/integrations/whoop/sync", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(syncWhoopFitnessDataMock).toHaveBeenCalledWith(USER_ID);
    expect(response.status).toBe(200);
    expect(payload.summary).toEqual({
      cycles: 90,
      recoveries: 90,
      sleeps: 93,
      workouts: 34,
      bodyMeasurement: true,
      syncedAt: "2026-08-11T12:00:00.000Z",
    });
    expect(JSON.stringify(payload)).not.toContain("access_token");
    expect(JSON.stringify(payload)).not.toContain("raw_payload");
  });
});
