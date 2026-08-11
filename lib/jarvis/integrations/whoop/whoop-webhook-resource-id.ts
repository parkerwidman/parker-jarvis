import "server-only";

import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";

/** WHOOP v2 webhook resource IDs are UUID strings (sleep/workout; recovery uses sleep UUID). */
const WHOOP_WEBHOOK_RESOURCE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWhoopWebhookResourceUuid(value: string): boolean {
  return WHOOP_WEBHOOK_RESOURCE_UUID_PATTERN.test(value);
}

export function parseWhoopWebhookResourceId(value: string): string {
  if (!isWhoopWebhookResourceUuid(value)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  return value.toLowerCase();
}

export function assertWhoopCycleId(cycleId: number): void {
  if (!Number.isInteger(cycleId) || cycleId <= 0) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }
}
