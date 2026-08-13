import { describe, expect, it } from "vitest";

import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";
import { selectRecentMessagesWithinBudget } from "@/lib/jarvis/context-engine/context-engine";
import { isMessageAfterWatermark } from "@/lib/jarvis/context-engine/conversation-state";

function msg(id: string, minute: number, content = `Message ${minute}`): AgentMessageRecord {
  return {
    id,
    role: minute % 2 === 1 ? "user" : "assistant",
    content,
    createdAt: new Date(Date.UTC(2026, 7, 13, 12, 0, minute)).toISOString(),
  };
}

describe("context gap prevention", () => {
  it("includes all unsummarized messages loaded after watermark without a hole", () => {
    const watermark = {
      id: "msg-24",
      createdAt: msg("msg-24", 24).createdAt,
    };

    const afterWatermark = Array.from({ length: 16 }, (_, index) =>
      msg(`msg-${25 + index}`, 25 + index),
    );

    const selected = selectRecentMessagesWithinBudget({
      messages: afterWatermark,
      watermark,
      tokenBudget: 100000,
      sectionsTrimmed: [],
    });

    expect(selected.map((message) => message.id)).toEqual(
      afterWatermark.map((message) => message.id),
    );
  });

  it("does not duplicate messages already at or before the watermark", () => {
    const watermark = {
      id: "msg-24",
      createdAt: msg("msg-24", 24).createdAt,
    };

    const mixed = [
      ...Array.from({ length: 24 }, (_, index) => msg(`msg-${index + 1}`, index + 1)),
      ...Array.from({ length: 5 }, (_, index) => msg(`msg-${25 + index}`, 25 + index)),
    ];

    const selected = selectRecentMessagesWithinBudget({
      messages: mixed,
      watermark,
      tokenBudget: 100000,
      sectionsTrimmed: [],
    });

    expect(selected.every((message) => isMessageAfterWatermark(message, watermark))).toBe(
      true,
    );
    expect(selected.map((message) => message.id)).toEqual([
      "msg-25",
      "msg-26",
      "msg-27",
      "msg-28",
      "msg-29",
    ]);
  });

  it("uses stable same-timestamp watermark ordering", () => {
    const sharedTimestamp = "2026-08-13T12:00:00.000Z";

    expect(
      isMessageAfterWatermark(
        { id: "00000000-0000-4000-8000-0000000000bb", createdAt: sharedTimestamp },
        { id: "00000000-0000-4000-8000-0000000000aa", createdAt: sharedTimestamp },
      ),
    ).toBe(true);

    expect(
      isMessageAfterWatermark(
        { id: "00000000-0000-4000-8000-0000000000aa", createdAt: sharedTimestamp },
        { id: "00000000-0000-4000-8000-0000000000bb", createdAt: sharedTimestamp },
      ),
    ).toBe(false);
  });
});

describe("summary concurrency semantics", () => {
  it("rejects a stale expected summary version on update", async () => {
    const updates: Array<{ expectedVersion: number | null; nextVersion: number }> = [];
    let currentVersion = 3;

    function tryUpdate(expectedVersion: number | null): boolean {
      if (expectedVersion === null) {
        currentVersion = 1;
        updates.push({ expectedVersion, nextVersion: currentVersion });
        return true;
      }

      if (expectedVersion !== currentVersion) {
        return false;
      }

      currentVersion = expectedVersion + 1;
      updates.push({ expectedVersion, nextVersion: currentVersion });
      return true;
    }

    expect(tryUpdate(3)).toBe(true);
    expect(tryUpdate(3)).toBe(false);
    expect(tryUpdate(4)).toBe(true);
    expect(currentVersion).toBe(5);
  });
});
