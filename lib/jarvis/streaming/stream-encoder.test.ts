import { describe, expect, it } from "vitest";

import { encodeJarvisStreamEvent } from "@/lib/jarvis/streaming/stream-encoder";

describe("encodeJarvisStreamEvent", () => {
  it("encodes newline-delimited JSON events", () => {
    expect(encodeJarvisStreamEvent({ type: "delta", delta: "Hi" })).toBe(
      '{"type":"delta","delta":"Hi"}\n',
    );
  });
});
