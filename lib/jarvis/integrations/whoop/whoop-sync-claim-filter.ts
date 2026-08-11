import "server-only";

/**
 * Escapes a value for PostgREST quoted filter literals.
 * Reserved characters in timestamptz values (notably `:` and `T`) must be quoted.
 */
export function escapePostgrestQuotedFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Builds the raw PostgREST `.or()` filter for atomic sync claim:
 * sync_in_progress_at IS NULL OR sync_in_progress_at < staleBefore
 */
export function buildWhoopSyncStaleClaimOrFilter(staleBeforeIso: string): string {
  const quotedStaleBefore = escapePostgrestQuotedFilterValue(staleBeforeIso);

  return `sync_in_progress_at.is.null,sync_in_progress_at.lt.${quotedStaleBefore}`;
}
