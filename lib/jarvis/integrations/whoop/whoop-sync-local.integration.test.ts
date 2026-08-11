import { afterEach, describe, expect, it } from "vitest";

import {
  claimWhoopSync,
  releaseWhoopSyncClaim,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-persistence";
import { WHOOP_SYNC_STALE_MS } from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import { createAutomationClient } from "@/lib/supabase/automation";

const USER_F3 = "f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3";
const LOCAL_INTEGRATION_ENABLED =
  process.env.RUN_WHOOP_F3_LOCAL_INTEGRATION === "1";

function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return url.includes("127.0.0.1") || url.includes("localhost");
}

describe.skipIf(
  !LOCAL_INTEGRATION_ENABLED ||
    !isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    !process.env.SUPABASE_SECRET_KEY,
)("WHOOP sync local PostgREST claim integration", () => {
  afterEach(async () => {
    await releaseWhoopSyncClaim(USER_F3);
  });

  it("claims atomically, rejects concurrent callers, and reclaims stale claims", async () => {
    const supabase = createAutomationClient();

    const first = await claimWhoopSync(USER_F3);
    expect(first.claimed).toBe(true);

    const second = await claimWhoopSync(USER_F3);
    expect(second).toEqual({ claimed: false, reason: "in_progress" });

    const staleClaimedAt = new Date(
      Date.now() - WHOOP_SYNC_STALE_MS - 60_000,
    ).toISOString();

    const { error: staleError } = await supabase
      .from("whoop_connections")
      .update({ sync_in_progress_at: staleClaimedAt })
      .eq("user_id", USER_F3);

    expect(staleError).toBeNull();

    const reclaimed = await claimWhoopSync(USER_F3);
    expect(reclaimed.claimed).toBe(true);
  });
});
