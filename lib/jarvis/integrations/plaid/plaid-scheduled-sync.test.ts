import { describe, expect, it } from "vitest";

import {
  aggregatePlaidScheduledSyncResults,
} from "@/lib/jarvis/integrations/plaid/plaid-scheduled-sync";
import type { PlaidConnectionSyncResult } from "@/lib/jarvis/integrations/plaid/plaid-types";

const CONNECTION_A = "22222222-2222-4222-8222-222222222222";
const CONNECTION_B = "33333333-3333-4333-8333-333333333333";

function buildResult(
  overrides: Partial<PlaidConnectionSyncResult> & Pick<PlaidConnectionSyncResult, "connectionId" | "status">,
): PlaidConnectionSyncResult {
  return {
    connectionId: overrides.connectionId,
    status: overrides.status,
    accountsCreated: overrides.accountsCreated ?? 0,
    accountsUpdated: overrides.accountsUpdated ?? 0,
    transactionsAdded: overrides.transactionsAdded ?? 0,
    transactionsModified: overrides.transactionsModified ?? 0,
    transactionsRemoved: overrides.transactionsRemoved ?? 0,
    transactionsMatchedExisting: overrides.transactionsMatchedExisting ?? 0,
    transactionsReviewRequired: overrides.transactionsReviewRequired ?? 0,
    rocketMoneyMappingsRemoved: overrides.rocketMoneyMappingsRemoved ?? 0,
    unclassifiedCount: overrides.unclassifiedCount ?? 0,
    errorCode: overrides.errorCode,
  };
}

describe("aggregatePlaidScheduledSyncResults", () => {
  it("counts successful connections and transaction totals", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([
      buildResult({
        connectionId: CONNECTION_A,
        status: "success",
        transactionsAdded: 2,
        transactionsReviewRequired: 1,
        rocketMoneyMappingsRemoved: 1,
      }),
    ]);

    expect(aggregate.connectionsAttempted).toBe(1);
    expect(aggregate.connectionsSucceeded).toBe(1);
    expect(aggregate.connectionsFailed).toBe(0);
    expect(aggregate.connectionsSkippedLocked).toBe(0);
    expect(aggregate.transactionsAdded).toBe(2);
    expect(aggregate.transactionsReviewRequired).toBe(1);
    expect(aggregate.rocketMoneyMappingsProtected).toBe(1);
  });

  it("treats review_required counts as a successful processed outcome", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([
      buildResult({
        connectionId: CONNECTION_A,
        status: "success",
        transactionsReviewRequired: 3,
      }),
    ]);

    expect(aggregate.connectionsSucceeded).toBe(1);
    expect(aggregate.transactionsReviewRequired).toBe(3);
  });

  it("marks locked overlaps as skipped rather than failed", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([
      buildResult({
        connectionId: CONNECTION_A,
        status: "error",
        errorCode: "sync_in_progress",
      }),
    ]);

    expect(aggregate.connectionsSkippedLocked).toBe(1);
    expect(aggregate.connectionsFailed).toBe(0);
  });

  it("isolates one failed connection from the next successful connection", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([
      buildResult({
        connectionId: CONNECTION_A,
        status: "error",
        errorCode: "sync_failed",
      }),
      buildResult({
        connectionId: CONNECTION_B,
        status: "success",
        transactionsAdded: 4,
      }),
    ]);

    expect(aggregate.connectionsAttempted).toBe(2);
    expect(aggregate.connectionsFailed).toBe(1);
    expect(aggregate.connectionsSucceeded).toBe(1);
    expect(aggregate.transactionsAdded).toBe(4);
  });

  it("returns zero counts for no eligible connections", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([]);

    expect(aggregate.connectionsAttempted).toBe(0);
    expect(aggregate.connectionsSucceeded).toBe(0);
    expect(aggregate.connectionsFailed).toBe(0);
    expect(aggregate.connectionsSkippedLocked).toBe(0);
  });

  it("returns aggregate counts only without private identifiers", () => {
    const aggregate = aggregatePlaidScheduledSyncResults([
      buildResult({
        connectionId: CONNECTION_A,
        status: "success",
        transactionsAdded: 1,
      }),
    ]);

    expect(JSON.stringify(aggregate)).not.toContain(CONNECTION_A);
    expect(Object.keys(aggregate)).toEqual([
      "connectionsAttempted",
      "connectionsSucceeded",
      "connectionsFailed",
      "connectionsSkippedLocked",
      "transactionsAdded",
      "transactionsModified",
      "transactionsRemoved",
      "transactionsMatchedExisting",
      "transactionsReviewRequired",
      "rocketMoneyMappingsProtected",
    ]);
  });
});
