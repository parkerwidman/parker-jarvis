import { afterEach, describe, expect, it } from "vitest";

import { WHOOP_WEBHOOK_STALE_PENDING_MS } from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { acquireWhoopWebhookEvent } from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import { createAutomationClient } from "@/lib/supabase/automation";

const USER_F5 = "f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5";
const SLEEP_ID = "f5c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1";
const LOCAL_INTEGRATION_ENABLED =
  process.env.RUN_WHOOP_F5_LOCAL_INTEGRATION === "1";

function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return url.includes("127.0.0.1") || url.includes("localhost");
}

async function cleanupTrace(traceId: string): Promise<void> {
  const supabase = createAutomationClient();
  await supabase.from("whoop_webhook_events").delete().eq("trace_id", traceId);
}

describe.skipIf(
  !LOCAL_INTEGRATION_ENABLED ||
    !isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    !process.env.SUPABASE_SECRET_KEY,
)("WHOOP webhook local PostgREST acquire integration", () => {
  afterEach(async () => {
    await cleanupTrace("f5-local-first-insert");
    await cleanupTrace("f5-local-failed-reclaim");
    await cleanupTrace("f5-local-stale-reclaim");
    await cleanupTrace("f5-local-fresh-pending");
    await cleanupTrace("f5-local-processed-dup");
  });

  it("allows exactly one winner for parallel first inserts", async () => {
    const traceId = "f5-local-first-insert";

    const results = await Promise.all([
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "sleep.updated",
        resourceId: SLEEP_ID,
      }),
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "sleep.updated",
        resourceId: SLEEP_ID,
      }),
    ]);

    expect(results.filter((result) => result.action === "process")).toHaveLength(1);
    expect(results.filter((result) => result.action === "noop")).toHaveLength(1);
  });

  it("allows exactly one winner for parallel failed reclaims", async () => {
    const traceId = "f5-local-failed-reclaim";
    const supabase = createAutomationClient();

    await supabase.from("whoop_webhook_events").insert({
      trace_id: traceId,
      user_id: USER_F5,
      event_type: "workout.updated",
      resource_id: SLEEP_ID,
      status: "failed",
      error_code: "whoop_webhook_provider_failed",
    });

    const results = await Promise.all([
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "workout.updated",
        resourceId: SLEEP_ID,
      }),
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "workout.updated",
        resourceId: SLEEP_ID,
      }),
    ]);

    expect(results.filter((result) => result.action === "process")).toHaveLength(1);
    expect(results.filter((result) => result.action === "noop")).toHaveLength(1);
  });

  it("allows exactly one winner for parallel stale pending reclaims", async () => {
    const traceId = "f5-local-stale-reclaim";
    const supabase = createAutomationClient();
    const staleUpdatedAt = new Date(
      Date.now() - WHOOP_WEBHOOK_STALE_PENDING_MS - 60_000,
    ).toISOString();

    await supabase.from("whoop_webhook_events").insert({
      trace_id: traceId,
      user_id: USER_F5,
      event_type: "sleep.updated",
      resource_id: SLEEP_ID,
      status: "pending",
      received_at: staleUpdatedAt,
      updated_at: staleUpdatedAt,
    });

    const results = await Promise.all([
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "sleep.updated",
        resourceId: SLEEP_ID,
      }),
      acquireWhoopWebhookEvent({
        traceId,
        userId: USER_F5,
        eventType: "sleep.updated",
        resourceId: SLEEP_ID,
      }),
    ]);

    expect(results.filter((result) => result.action === "process")).toHaveLength(1);
    expect(results.filter((result) => result.action === "noop")).toHaveLength(1);
  });

  it("returns noop for fresh pending duplicates without extra processing", async () => {
    const traceId = "f5-local-fresh-pending";
    const supabase = createAutomationClient();

    await supabase.from("whoop_webhook_events").insert({
      trace_id: traceId,
      user_id: USER_F5,
      event_type: "sleep.updated",
      resource_id: SLEEP_ID,
      status: "pending",
    });

    const result = await acquireWhoopWebhookEvent({
      traceId,
      userId: USER_F5,
      eventType: "sleep.updated",
      resourceId: SLEEP_ID,
    });

    expect(result).toEqual({ action: "noop", reason: "in_progress" });
  });

  it("returns noop for processed duplicates", async () => {
    const traceId = "f5-local-processed-dup";
    const supabase = createAutomationClient();

    await supabase.from("whoop_webhook_events").insert({
      trace_id: traceId,
      user_id: USER_F5,
      event_type: "sleep.updated",
      resource_id: SLEEP_ID,
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    const result = await acquireWhoopWebhookEvent({
      traceId,
      userId: USER_F5,
      eventType: "sleep.updated",
      resourceId: SLEEP_ID,
    });

    expect(result).toEqual({ action: "noop", reason: "already_processed" });
  });
});
