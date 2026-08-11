import { describe, expect, it } from "vitest";

import {
  buildWhoopSyncStaleClaimOrFilter,
  escapePostgrestQuotedFilterValue,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-claim-filter";

describe("WHOOP sync stale claim PostgREST filter", () => {
  it("quotes ISO timestamps for lt filters", () => {
    const staleBefore = "2026-08-11T17:08:00.000Z";

    expect(escapePostgrestQuotedFilterValue(staleBefore)).toBe(
      '"2026-08-11T17:08:00.000Z"',
    );
    expect(buildWhoopSyncStaleClaimOrFilter(staleBefore)).toBe(
      'sync_in_progress_at.is.null,sync_in_progress_at.lt."2026-08-11T17:08:00.000Z"',
    );
  });

  it("escapes embedded double quotes", () => {
    expect(escapePostgrestQuotedFilterValue('value"with"quotes')).toBe(
      '"value""with""quotes"',
    );
  });
});
