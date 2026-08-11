import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export function buildWhoopWebhookSignatureInput(
  signatureTimestamp: string,
  rawBody: string,
): string {
  return `${signatureTimestamp}${rawBody}`;
}

export function computeWhoopWebhookSignature(
  signatureTimestamp: string,
  rawBody: string,
  clientSecret: string,
): string {
  return createHmac("sha256", clientSecret)
    .update(buildWhoopWebhookSignatureInput(signatureTimestamp, rawBody))
    .digest("base64");
}

export function verifyWhoopWebhookSignature(params: {
  signatureTimestamp: string;
  rawBody: string;
  signature: string;
  clientSecret: string;
}): boolean {
  const expected = computeWhoopWebhookSignature(
    params.signatureTimestamp,
    params.rawBody,
    params.clientSecret,
  );

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(params.signature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
