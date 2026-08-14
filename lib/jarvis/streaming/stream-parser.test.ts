import { describe, expect, it } from "vitest";

import {
  createJarvisStreamParserState,
  flushJarvisStreamParser,
  parseJarvisStreamChunk,
} from "@/lib/jarvis/streaming/stream-parser";

describe("parseJarvisStreamChunk", () => {
  it("parses one event per chunk", () => {
    const state = createJarvisStreamParserState();
    const events = parseJarvisStreamChunk(
      state,
      '{"type":"delta","delta":"Hi"}\n',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "delta", delta: "Hi" });
  });

  it("parses several events in one chunk", () => {
    const state = createJarvisStreamParserState();
    const events = parseJarvisStreamChunk(
      state,
      '{"type":"thread","threadId":"t1"}\n{"type":"delta","delta":"A"}\n',
    );

    expect(events).toHaveLength(2);
  });

  it("handles an event split across chunks", () => {
    const state = createJarvisStreamParserState();
    parseJarvisStreamChunk(state, '{"type":"delta","delta":"hel');
    const events = parseJarvisStreamChunk(state, 'lo"}\n');

    expect(events).toEqual([{ type: "delta", delta: "hello" }]);
  });

  it("handles unicode split across chunks", () => {
    const state = createJarvisStreamParserState();
    parseJarvisStreamChunk(state, '{"type":"delta","delta":"caf');
    const events = parseJarvisStreamChunk(state, 'é"}\n');

    expect(events).toEqual([{ type: "delta", delta: "café" }]);
  });

  it("flushes a final partial buffer", () => {
    const state = createJarvisStreamParserState();
    parseJarvisStreamChunk(state, '{"type":"done","threadId":"t1","reply":"ok","requestId":"r1"}');
    const events = flushJarvisStreamParser(state);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("done");
  });

  it("counts malformed JSON without throwing", () => {
    const state = createJarvisStreamParserState();
    parseJarvisStreamChunk(state, '{bad json}\n{"type":"delta","delta":"x"}\n');

    expect(state.parseErrors).toBe(1);
  });
});
