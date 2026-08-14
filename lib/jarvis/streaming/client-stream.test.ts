import { describe, expect, it } from "vitest";

import { createStreamDeltaBatcher } from "@/lib/jarvis/streaming/client-stream";

describe("createStreamDeltaBatcher", () => {
  it("accumulates deltas and flushes on demand", () => {
    let content = "";
    const batcher = createStreamDeltaBatcher(
      (next) => {
        content = next;
      },
      () => content,
    );

    batcher.append("Hello");
    batcher.append(" world");
    batcher.flushNow();

    expect(content).toBe("Hello world");
  });

  it("resets visible content", () => {
    let content = "partial";
    const batcher = createStreamDeltaBatcher(
      (next) => {
        content = next;
      },
      () => content,
    );

    batcher.reset();
    expect(content).toBe("");
  });
});
