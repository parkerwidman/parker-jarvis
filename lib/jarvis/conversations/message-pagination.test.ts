import { describe, expect, it } from "vitest";

import { UI_MESSAGES_PAGE_SIZE } from "@/lib/jarvis/agents/agent-message-tools";
import {
  parseMessagePageCursor,
  parseMessagePaginationLimit,
} from "@/lib/jarvis/conversations/message-pagination";

describe("message pagination validation", () => {
  it("caps page size at the UI maximum", () => {
    expect(parseMessagePaginationLimit("999")).toBe(UI_MESSAGES_PAGE_SIZE);
    expect(parseMessagePaginationLimit("10")).toBe(10);
    expect(parseMessagePaginationLimit(null)).toBe(UI_MESSAGES_PAGE_SIZE);
    expect(parseMessagePaginationLimit("not-a-number")).toBe(
      UI_MESSAGES_PAGE_SIZE,
    );
  });

  it("accepts a complete valid cursor", () => {
    expect(
      parseMessagePageCursor({
        beforeCreatedAt: "2026-08-13T12:00:00.000Z",
        beforeId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      createdAt: "2026-08-13T12:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("rejects partial or malformed cursors", () => {
    expect(
      parseMessagePageCursor({
        beforeCreatedAt: "2026-08-13T12:00:00.000Z",
        beforeId: null,
      }),
    ).toBe("invalid");

    expect(
      parseMessagePageCursor({
        beforeCreatedAt: "not-a-date",
        beforeId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe("invalid");

    expect(
      parseMessagePageCursor({
        beforeCreatedAt: "2026-08-13T12:00:00.000Z",
        beforeId: "not-a-uuid",
      }),
    ).toBe("invalid");
  });
});
