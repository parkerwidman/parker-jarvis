import "server-only";

import { loadConnectedWhoopConnectionByWhoopUserId } from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { getWhoopOAuthConfig } from "@/lib/jarvis/integrations/whoop/whoop-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import {
  buildWhoopWebhookPayloadFromPersistedEvent,
  mapWebhookProcessingError,
  processPersistedWhoopWebhookEvent,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-event-processor";
import { parseWhoopWebhookPayload } from "@/lib/jarvis/integrations/whoop/whoop-webhook-payload";
import {
  acquireWhoopWebhookEvent,
  markWhoopWebhookEventFailed,
  markWhoopWebhookEventProcessed,
  markWhoopWebhookEventTerminalProcessed,
  touchWhoopConnectionLastWebhookAt,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import { verifyWhoopWebhookSignature } from "@/lib/jarvis/integrations/whoop/whoop-webhook-signature";
import type { WhoopWebhookPayload } from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

export type WhoopWebhookHandlerResult =
  | { ok: true; httpStatus: number }
  | { ok: false; httpStatus: number; error: string };

function logWhoopWebhookFailure(errorCode: string): void {
  console.error("[whoop-webhook]", {
    integration: "whoop",
    operation: "webhook",
    error_code: errorCode,
  });
}

function mapUnexpectedWebhookError(error: unknown): WhoopWebhookHandlerResult {
  const mapped = mapWebhookProcessingError(error);

  if (mapped.retryable || mapped.terminal) {
    logWhoopWebhookFailure(mapped.code);
  } else {
    logWhoopWebhookFailure(WHOOP_WEBHOOK_ERROR_CODES.failed);
  }

  return {
    ok: false,
    httpStatus: 502,
    error: WHOOP_WEBHOOK_ERROR_CODES.failed,
  };
}

async function resolveConnectedWhoopConnection(payload: WhoopWebhookPayload) {
  const connection = await loadConnectedWhoopConnectionByWhoopUserId(
    payload.user_id,
  );

  if (!connection) {
    return null;
  }

  return {
    connectionId: connection.connectionId,
    userId: connection.userId,
    whoopUserId: connection.whoopUserId,
  };
}

export async function handleWhoopWebhook(params: {
  rawBody: string;
  signature: string | null;
  signatureTimestamp: string | null;
  now?: Date;
}): Promise<WhoopWebhookHandlerResult> {
  const now = params.now ?? new Date();
  const processedAt = now.toISOString();

  if (!params.signature || !params.signatureTimestamp) {
    return {
      ok: false,
      httpStatus: 401,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  let clientSecret: string;

  try {
    ({ clientSecret } = getWhoopOAuthConfig());
  } catch {
    logWhoopWebhookFailure(WHOOP_WEBHOOK_ERROR_CODES.failed);
    return {
      ok: false,
      httpStatus: 502,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  const signatureValid = verifyWhoopWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
    signatureTimestamp: params.signatureTimestamp,
    clientSecret,
  });

  if (!signatureValid) {
    return {
      ok: false,
      httpStatus: 401,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  let payload: WhoopWebhookPayload;

  try {
    payload = parseWhoopWebhookPayload(params.rawBody);
  } catch {
    return {
      ok: false,
      httpStatus: 400,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  try {
    const connection = await resolveConnectedWhoopConnection(payload);
    const acquire = await acquireWhoopWebhookEvent({
      traceId: payload.trace_id,
      userId: connection?.userId ?? null,
      eventType: payload.type,
      resourceId: payload.id,
      now,
    });

    if (acquire.action === "noop") {
      return { ok: true, httpStatus: 200 };
    }

    const event = acquire.event;

    if (!connection) {
      await markWhoopWebhookEventTerminalProcessed({
        eventId: event.id,
        processedAt,
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.unknownUser,
      });

      return { ok: true, httpStatus: 200 };
    }

    try {
      await processPersistedWhoopWebhookEvent({
        payload,
        connection,
        processedAt,
      });

      await markWhoopWebhookEventProcessed({
        eventId: event.id,
        processedAt,
      });
      await touchWhoopConnectionLastWebhookAt({
        connectionId: connection.connectionId,
        receivedAt: processedAt,
      });

      return { ok: true, httpStatus: 200 };
    } catch (error) {
      const mapped = mapWebhookProcessingError(error);

      if (mapped.terminal) {
        await markWhoopWebhookEventTerminalProcessed({
          eventId: event.id,
          processedAt,
          errorCode: mapped.code,
        });

        return { ok: true, httpStatus: 200 };
      }

      await markWhoopWebhookEventFailed({
        eventId: event.id,
        errorCode: mapped.code,
      });

      return {
        ok: false,
        httpStatus: 502,
        error: WHOOP_WEBHOOK_ERROR_CODES.failed,
      };
    }
  } catch (error) {
    return mapUnexpectedWebhookError(error);
  }
}
