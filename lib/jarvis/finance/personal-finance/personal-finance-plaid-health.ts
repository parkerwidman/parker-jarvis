import {
  evaluatePlaidSyncHealth,
  hoursSinceIsoTimestamp,
} from "@/lib/jarvis/briefings/finance-brief-rules";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";

export type PersonalFinancePlaidHealthSummary = {
  connectedCount: number;
  reconnectRequiredCount: number;
  errorCount: number;
  staleSyncCount: number;
  pendingFirstSyncCount: number;
  pendingReviewCount: number;
};

export function buildPersonalFinancePlaidHealthSummary(
  connections: PlaidSafeConnectionSummary[],
  pendingReviewCount: number,
  now: Date,
): PersonalFinancePlaidHealthSummary {
  let connectedCount = 0;
  let reconnectRequiredCount = 0;
  let errorCount = 0;
  let staleSyncCount = 0;
  let pendingFirstSyncCount = 0;

  for (const connection of connections) {
    if (connection.status === "connected") {
      connectedCount += 1;
    }

    if (connection.status === "reconnect_required") {
      reconnectRequiredCount += 1;
    }

    if (connection.status === "error") {
      errorCount += 1;
    }

    const syncHealth = evaluatePlaidSyncHealth(connection, now);

    if (syncHealth === "stale") {
      staleSyncCount += 1;
    } else if (syncHealth === "first_sync_pending") {
      pendingFirstSyncCount += 1;
    }
  }

  return {
    connectedCount,
    reconnectRequiredCount,
    errorCount,
    staleSyncCount,
    pendingFirstSyncCount,
    pendingReviewCount,
  };
}

export function resolveLatestSuccessfulPlaidSyncAt(
  connections: PlaidSafeConnectionSummary[],
): string | null {
  let latest: string | null = null;

  for (const connection of connections) {
    if (!connection.lastSuccessfulSyncAt) {
      continue;
    }

    if (!latest || connection.lastSuccessfulSyncAt > latest) {
      latest = connection.lastSuccessfulSyncAt;
    }
  }

  return latest;
}

export function formatPersonalFinanceLastSyncState(
  lastSuccessfulSyncAt: string | null,
  now: Date,
): string | null {
  if (!lastSuccessfulSyncAt) {
    return "No successful sync yet";
  }

  const ageHours = hoursSinceIsoTimestamp(lastSuccessfulSyncAt, now);

  if (ageHours === null) {
    return null;
  }

  if (ageHours < 1) {
    return "Synced recently";
  }

  if (ageHours < 24) {
    return "Synced today";
  }

  if (ageHours < 48) {
    return "Synced yesterday";
  }

  const days = Math.floor(ageHours / 24);
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago`;
}
