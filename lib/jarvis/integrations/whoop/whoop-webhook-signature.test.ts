import { describe, expect, it } from "vitest";

import {
  computeWhoopWebhookSignature,
  verifyWhoopWebhookSignature,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-signature";

const CLIENT_SECRET = "test-client-secret";
const RAW_BODY = '{"user_id":10129,"id":"abc","type":"sleep.updated","trace_id":"trace-1"}';
const TIMESTAMP = "1710000000000";

describe("WHOOP webhook signature", () => {
  it("accepts valid signatures over the exact raw body", () => {
    const signature = computeWhoopWebhookSignature(
      TIMESTAMP,
      RAW_BODY,
      CLIENT_SECRET,
    );

    expect(
      verifyWhoopWebhookSignature({
        signatureTimestamp: TIMESTAMP,
        rawBody: RAW_BODY,
        signature,
        clientSecret: CLIENT_SECRET,
      }),
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyWhoopWebhookSignature({
        signatureTimestamp: TIMESTAMP,
        rawBody: RAW_BODY,
        signature: "invalid-signature",
        clientSecret: CLIENT_SECRET,
      }),
    ).toBe(false);
  });

  it("rejects reserialized JSON when bytes differ", () => {
    const signature = computeWhoopWebhookSignature(
      TIMESTAMP,
      RAW_BODY,
      CLIENT_SECRET,
    );
    const reserialized = `${JSON.stringify(JSON.parse(RAW_BODY))} `;

    expect(
      verifyWhoopWebhookSignature({
        signatureTimestamp: TIMESTAMP,
        rawBody: reserialized,
        signature,
        clientSecret: CLIENT_SECRET,
      }),
    ).toBe(false);
  });

  it("uses constant-time comparison semantics for different lengths", () => {
    const signature = computeWhoopWebhookSignature(
      TIMESTAMP,
      RAW_BODY,
      CLIENT_SECRET,
    );

    expect(
      verifyWhoopWebhookSignature({
        signatureTimestamp: TIMESTAMP,
        rawBody: RAW_BODY,
        signature: `${signature}x`,
        clientSecret: CLIENT_SECRET,
      }),
    ).toBe(false);
  });
});
