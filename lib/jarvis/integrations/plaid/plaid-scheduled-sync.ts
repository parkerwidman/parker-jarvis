import "server-only";

import {
  syncAllPlaidConnectionsForUser,
} from "@/lib/jarvis/integrations/plaid/plaid-sync-service";
import type { PlaidConnectionSyncResult } from "@/lib/jarvis/integrations/plaid/plaid-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlaidScheduledSyncAggregate = {
  connectionsAttempted: number;
  connectionsSucceeded: number;
  connectionsFailed: number;
  connectionsSkippedLocked: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  transactionsMatchedExisting: number;
  transactionsReviewRequired: number;
  rocketMoneyMappingsProtected: number;
};

export function aggregatePlaidScheduledSyncResults(
  results: PlaidConnectionSyncResult[],
): PlaidScheduledSyncAggregate {
  const aggregate: PlaidScheduledSyncAggregate = {
    connectionsAttempted: results.length,
    connectionsSucceeded: 0,
    connectionsFailed: 0,
    connectionsSkippedLocked: 0,
    transactionsAdded: 0,
    transactionsModified: 0,
    transactionsRemoved: 0,
    transactionsMatchedExisting: 0,
    transactionsReviewRequired: 0,
    rocketMoneyMappingsProtected: 0,
  };

  for (const result of results) {
    if (result.errorCode === "sync_in_progress") {
      aggregate.connectionsSkippedLocked += 1;
      continue;
    }

    if (result.status === "success") {
      aggregate.connectionsSucceeded += 1;
    } else {
      aggregate.connectionsFailed += 1;
    }

    aggregate.transactionsAdded += result.transactionsAdded;
    aggregate.transactionsModified += result.transactionsModified;
    aggregate.transactionsRemoved += result.transactionsRemoved;
    aggregate.transactionsMatchedExisting += result.transactionsMatchedExisting;
    aggregate.transactionsReviewRequired += result.transactionsReviewRequired;
    aggregate.rocketMoneyMappingsProtected += result.rocketMoneyMappingsRemoved;
  }

  return aggregate;
}

export async function runScheduledPlaidSync(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<PlaidScheduledSyncAggregate> {
  const results = await syncAllPlaidConnectionsForUser(supabase, ownerUserId);
  return aggregatePlaidScheduledSyncResults(results);
}
