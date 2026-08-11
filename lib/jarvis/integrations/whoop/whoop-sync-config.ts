import "server-only";

/** Initial manual sync backfill window for paginated WHOOP collections. */
export const WHOOP_SYNC_BACKFILL_DAYS = 90;

export const WHOOP_SYNC_PAGE_LIMIT = 25;

/** Safety bound for paginated collection fetches (25 records/page). */
export const WHOOP_SYNC_MAX_PAGES = 200;

/** Stale sync claim recovery threshold for manual sync concurrency. */
export const WHOOP_SYNC_STALE_MS = 10 * 60 * 1000;

export const WHOOP_DATA_REQUEST_TIMEOUT_MS = 30_000;

export const WHOOP_CYCLES_PATH = "/v2/cycle";
export const WHOOP_RECOVERIES_PATH = "/v2/recovery";
export const WHOOP_SLEEPS_PATH = "/v2/activity/sleep";
export const WHOOP_WORKOUTS_PATH = "/v2/activity/workout";
export const WHOOP_BODY_MEASUREMENT_PATH = "/v2/user/measurement/body";

export function getWhoopSyncWindow(now = Date.now()): {
  start: string;
  end: string;
} {
  const endDate = new Date(now);
  const startDate = new Date(now - WHOOP_SYNC_BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}
