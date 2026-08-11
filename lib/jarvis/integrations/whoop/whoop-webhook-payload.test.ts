import { describe, expect, it } from "vitest";

import { parseWhoopWebhookPayload } from "@/lib/jarvis/integrations/whoop/whoop-webhook-payload";

const VALID_SLEEP_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("WHOOP webhook payload validation", () => {
  it("accepts supported v2 payloads", () => {
    expect(
      parseWhoopWebhookPayload(
        JSON.stringify({
          user_id: 10129,
          id: VALID_SLEEP_ID,
          type: "recovery.updated",
          trace_id: "trace-abc",
        }),
      ),
    ).toEqual({
      user_id: 10129,
      id: VALID_SLEEP_ID,
      type: "recovery.updated",
      trace_id: "trace-abc",
    });
  });

  it("rejects malformed JSON and unsupported event types", () => {
    expect(() => parseWhoopWebhookPayload("{bad json")).toThrow();
    expect(() =>
      parseWhoopWebhookPayload(
        JSON.stringify({
          user_id: 10129,
          id: VALID_SLEEP_ID,
          type: "cycle.updated",
          trace_id: "trace-abc",
        }),
      ),
    ).toThrow();
  });

  it("rejects malformed resource UUIDs before provider calls", () => {
    expect(() =>
      parseWhoopWebhookPayload(
        JSON.stringify({
          user_id: 10129,
          id: "sleep-1",
          type: "sleep.updated",
          trace_id: "trace-abc",
        }),
      ),
    ).toThrow();
  });
});
