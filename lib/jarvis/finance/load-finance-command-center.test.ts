import { describe, expect, it } from "vitest";
import {
  resolveFinanceConnectionStatus,
  summarizePlaidConnections,
} from "@/lib/jarvis/finance/load-finance-command-center";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";

function buildPlaidConnection(
  overrides: Partial<PlaidSafeConnectionSummary> = {},
): PlaidSafeConnectionSummary {
  return {
    id: overrides.id ?? "conn-1",
    connected: overrides.connected ?? true,
    status: overrides.status ?? "connected",
    institutionName: overrides.institutionName ?? "Bank",
    environment: "production",
    connectedAt: "2026-08-01T12:00:00.000Z",
    lastSuccessfulSyncAt:
      overrides.lastSuccessfulSyncAt === undefined
        ? "2026-08-06T10:00:00.000Z"
        : overrides.lastSuccessfulSyncAt,
    reconnectRequired: overrides.reconnectRequired ?? false,
    lastErrorCode: overrides.lastErrorCode ?? null,
    syncInProgress: overrides.syncInProgress ?? false,
    linkedAccountsCount: overrides.linkedAccountsCount ?? 3,
    lastSyncAccountsCreated: 0,
    lastSyncAccountsUpdated: 0,
    lastSyncTransactionsAdded: 0,
    lastSyncTransactionsModified: 0,
    lastSyncTransactionsRemoved: 0,
    lastSyncUnclassifiedCount: 0,
  };
}

describe("resolveFinanceConnectionStatus", () => {
  it("returns no_connections when institution count is zero", () => {
    expect(
      resolveFinanceConnectionStatus({
        connectedPlaidConnectionCount: 0,
        anyConnectionNeedsAttention: false,
        anyConnectionSyncInProgress: false,
      }),
    ).toBe("no_connections");
  });

  it("prioritizes needs_attention over syncing", () => {
    expect(
      resolveFinanceConnectionStatus({
        connectedPlaidConnectionCount: 1,
        anyConnectionNeedsAttention: true,
        anyConnectionSyncInProgress: true,
      }),
    ).toBe("needs_attention");
  });

  it("returns syncing when a connection sync is in progress", () => {
    expect(
      resolveFinanceConnectionStatus({
        connectedPlaidConnectionCount: 1,
        anyConnectionNeedsAttention: false,
        anyConnectionSyncInProgress: true,
      }),
    ).toBe("syncing");
  });

  it("returns connected for healthy connections", () => {
    expect(
      resolveFinanceConnectionStatus({
        connectedPlaidConnectionCount: 2,
        anyConnectionNeedsAttention: false,
        anyConnectionSyncInProgress: false,
      }),
    ).toBe("connected");
  });
});

describe("summarizePlaidConnections", () => {
  it("aggregates institution count, linked accounts, and latest sync", () => {
    const summary = summarizePlaidConnections([
      buildPlaidConnection({
        id: "conn-1",
        linkedAccountsCount: 4,
        lastSuccessfulSyncAt: "2026-08-05T10:00:00.000Z",
      }),
      buildPlaidConnection({
        id: "conn-2",
        linkedAccountsCount: 8,
        lastSuccessfulSyncAt: "2026-08-06T12:00:00.000Z",
      }),
    ]);

    expect(summary.connectedPlaidConnectionCount).toBe(2);
    expect(summary.linkedPlaidAccountCount).toBe(12);
    expect(summary.latestSuccessfulPlaidSyncAt).toBe("2026-08-06T12:00:00.000Z");
  });

  it("detects attention and syncing states", () => {
    const summary = summarizePlaidConnections([
      buildPlaidConnection({ reconnectRequired: true }),
      buildPlaidConnection({ id: "conn-2", syncInProgress: true }),
    ]);

    expect(summary.anyConnectionNeedsAttention).toBe(true);
    expect(summary.anyConnectionSyncInProgress).toBe(true);
  });

  it("counts only connected institutions", () => {
    const summary = summarizePlaidConnections([
      buildPlaidConnection({ connected: false, status: "error" }),
      buildPlaidConnection({ id: "conn-2", connected: true }),
    ]);

    expect(summary.connectedPlaidConnectionCount).toBe(1);
  });

  it("returns null latest sync when no successful sync exists", () => {
    const summary = summarizePlaidConnections([
      buildPlaidConnection({ lastSuccessfulSyncAt: null }),
    ]);

    expect(summary.latestSuccessfulPlaidSyncAt).toBeNull();
  });
});

describe("loadFinanceCommandCenter module exports", () => {
  it("exports connection status helpers used by the dashboard", async () => {
    const module = await import("@/lib/jarvis/finance/load-finance-command-center");

    expect(typeof module.loadFinanceCommandCenter).toBe("function");
    expect(typeof module.resolveFinanceConnectionStatus).toBe("function");
    expect(typeof module.summarizePlaidConnections).toBe("function");
  });
});
