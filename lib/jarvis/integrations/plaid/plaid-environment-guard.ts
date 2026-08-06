import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaidEnvironment } from "./plaid-config";
import type { PlaidConnectionRow, PlaidEnvironment } from "./plaid-types";
import { PlaidSafeError } from "./plaid-types";

const SECRET_COLUMNS =
  "id, user_id, item_id, institution_id, institution_name, encrypted_access_token, encryption_version, environment, status, products, transactions_cursor, last_successful_sync_at, last_webhook_at, last_error_code, last_sync_accounts_created, last_sync_accounts_updated, last_sync_transactions_added, last_sync_transactions_modified, last_sync_transactions_removed, last_sync_unclassified_count, linked_accounts_count, sync_in_progress_at, connected_at, disconnected_at, created_at, updated_at";

export function getCurrentPlaidRuntimeEnvironment(): PlaidEnvironment {
  return getPlaidEnvironment();
}

export function connectionMatchesRuntimeEnvironment(
  connection: Pick<PlaidConnectionRow, "environment">,
): boolean {
  return connection.environment === getPlaidEnvironment();
}

export async function loadRuntimePlaidConnectionRowById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlaidConnectionRow | null> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SECRET_COLUMNS)
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("environment", getPlaidEnvironment())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PlaidConnectionRow | null) ?? null;
}

export async function requireRuntimePlaidConnectionRowById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlaidConnectionRow> {
  const row = await loadRuntimePlaidConnectionRowById(supabase, userId, connectionId);

  if (!row) {
    throw new PlaidSafeError("item_not_found");
  }

  return row;
}

export type CurrentRuntimePlaidFinanceIds = {
  accountIds: Set<string>;
  transactionIds: Set<string>;
};

export async function loadCurrentRuntimePlaidFinanceIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentRuntimePlaidFinanceIds> {
  const runtimeEnv = getPlaidEnvironment();

  const { data: connections, error: connectionsError } = await supabase
    .from("plaid_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", runtimeEnv);

  if (connectionsError) {
    throw connectionsError;
  }

  const connectionIds = (connections ?? []).map((connection) => connection.id);

  if (connectionIds.length === 0) {
    return { accountIds: new Set(), transactionIds: new Set() };
  }

  const [accountMappingsResult, transactionMappingsResult] = await Promise.all([
    supabase
      .from("plaid_finance_account_mappings")
      .select("finance_account_id")
      .eq("user_id", userId)
      .in("plaid_connection_id", connectionIds),
    supabase
      .from("plaid_finance_transaction_mappings")
      .select("finance_transaction_id")
      .eq("user_id", userId)
      .in("plaid_connection_id", connectionIds),
  ]);

  if (accountMappingsResult.error) {
    throw accountMappingsResult.error;
  }

  if (transactionMappingsResult.error) {
    throw transactionMappingsResult.error;
  }

  return {
    accountIds: new Set(
      ((accountMappingsResult.data ?? []) as Array<{ finance_account_id: string }>).map(
        (mapping) => mapping.finance_account_id,
      ),
    ),
    transactionIds: new Set(
      ((transactionMappingsResult.data ?? []) as Array<{ finance_transaction_id: string }>).map(
        (mapping) => mapping.finance_transaction_id,
      ),
    ),
  };
}
