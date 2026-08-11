import "server-only";

import {
  buildWhoopWebhookPayloadFromPersistedEvent,
  mapWebhookProcessingError,
  processPersistedWhoopWebhookEvent,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-event-processor";
import { WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT } from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import {
  acquireWhoopWebhookEvent,
  listWhoopWebhookEventsForReplay,
  markWhoopWebhookEventFailed,
  markWhoopWebhookEventProcessed,
  markWhoopWebhookEventTerminalProcessed,
  touchWhoopConnectionLastWebhookAt,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import type { WhoopWebhookConnectedConnection } from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

export type WhoopWebhookSweepResult = {
  attempted: number;
  processed: number;
  failed: number;
  skipped: number;
};

export async function sweepWhoopWebhookEvents(params: {
  connection: WhoopWebhookConnectedConnection;
  limit?: number;
  now?: Date;
}): Promise<WhoopWebhookSweepResult> {
  const now = params.now ?? new Date();
  const processedAt = now.toISOString();
  const limit = params.limit ?? WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT;
  const candidates = await listWhoopWebhookEventsForReplay({
    userId: params.connection.userId,
    limit,
    now,
  });

  const result: WhoopWebhookSweepResult = {
    attempted: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    result.attempted += 1;

    let payload;

    try {
      payload = buildWhoopWebhookPayloadFromPersistedEvent({
        event: candidate,
        whoopUserId: params.connection.whoopUserId,
      });
    } catch {
      await markWhoopWebhookEventTerminalProcessed({
        eventId: candidate.id,
        processedAt,
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.invalidPayload,
      });
      result.failed += 1;
      continue;
    }

    const acquire = await acquireWhoopWebhookEvent({
      traceId: candidate.trace_id,
      userId: params.connection.userId,
      eventType: candidate.event_type,
      resourceId: candidate.resource_id,
      now,
    });

    if (acquire.action === "noop") {
      result.skipped += 1;
      continue;
    }

    try {
      await processPersistedWhoopWebhookEvent({
        payload,
        connection: params.connection,
        processedAt,
      });

      await markWhoopWebhookEventProcessed({
        eventId: acquire.event.id,
        processedAt,
      });
      await touchWhoopConnectionLastWebhookAt({
        connectionId: params.connection.connectionId,
        receivedAt: processedAt,
      });

      result.processed += 1;
    } catch (error) {
      const mapped = mapWebhookProcessingError(error);

      if (mapped.terminal) {
        await markWhoopWebhookEventTerminalProcessed({
          eventId: acquire.event.id,
          processedAt,
          errorCode: mapped.code,
        });
        result.failed += 1;
        continue;
      }

      await markWhoopWebhookEventFailed({
        eventId: acquire.event.id,
        errorCode: mapped.code,
      });
      result.failed += 1;
    }
  }

  return result;
}
