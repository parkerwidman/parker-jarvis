import { describe, expect, it } from "vitest";

import { parseStreamRequested } from "@/lib/jarvis/agents/run-agent-chat-stream";

describe("parseStreamRequested", () => {
  it("returns true only for explicit main stream requests", () => {
    expect(parseStreamRequested({ stream: true })).toBe(true);
    expect(parseStreamRequested({ stream: false })).toBe(false);
    expect(parseStreamRequested({})).toBe(false);
  });
});
