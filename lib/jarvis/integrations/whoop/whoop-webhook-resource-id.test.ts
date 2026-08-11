import { describe, expect, it } from "vitest";

import {
  isWhoopWebhookResourceUuid,
  parseWhoopWebhookResourceId,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-resource-id";
import {
  whoopCycleRecoveryPath,
  whoopSleepByIdPath,
  whoopWorkoutByIdPath,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import { WHOOP_SYNC_ERROR_CODES, WhoopSyncError } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

const VALID_SLEEP_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_WORKOUT_ID = "223e4567-e89b-12d3-a456-426614174001";

describe("WHOOP webhook resource ID validation", () => {
  it("accepts canonical UUID resource IDs", () => {
    expect(parseWhoopWebhookResourceId(VALID_SLEEP_ID)).toBe(VALID_SLEEP_ID);
    expect(parseWhoopWebhookResourceId(VALID_WORKOUT_ID.toUpperCase())).toBe(
      VALID_WORKOUT_ID,
    );
  });

  it("rejects malformed resource UUIDs", () => {
    expect(isWhoopWebhookResourceUuid("sleep-1")).toBe(false);
    expect(isWhoopWebhookResourceUuid("../admin")).toBe(false);
    expect(() => parseWhoopWebhookResourceId("not-a-uuid")).toThrow();
  });
});

describe("WHOOP targeted URL safety", () => {
  it("encodes validated resource UUID path segments", () => {
    expect(whoopSleepByIdPath(VALID_SLEEP_ID)).toBe(
      `/v2/activity/sleep/${encodeURIComponent(VALID_SLEEP_ID)}`,
    );
    expect(whoopWorkoutByIdPath(VALID_WORKOUT_ID)).toBe(
      `/v2/activity/workout/${encodeURIComponent(VALID_WORKOUT_ID)}`,
    );
  });

  it("rejects malformed cycle IDs before URL construction", () => {
    expect(() => whoopCycleRecoveryPath(0)).toThrow(WhoopSyncError);
    expect(() => whoopCycleRecoveryPath(1.5)).toThrow(WhoopSyncError);

    try {
      whoopCycleRecoveryPath(0);
    } catch (error) {
      expect(error).toBeInstanceOf(WhoopSyncError);
      expect((error as WhoopSyncError).code).toBe(
        WHOOP_SYNC_ERROR_CODES.invalidPayload,
      );
    }
  });

  it("builds encoded cycle recovery paths for valid cycle IDs", () => {
    expect(whoopCycleRecoveryPath(93845)).toBe("/v2/cycle/93845/recovery");
  });
});
