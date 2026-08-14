import type { JarvisStreamEvent } from "@/lib/jarvis/streaming/stream-events";

export type JarvisStreamParserState = {
  buffer: string;
  events: JarvisStreamEvent[];
  parseErrors: number;
};

export function createJarvisStreamParserState(): JarvisStreamParserState {
  return {
    buffer: "",
    events: [],
    parseErrors: 0,
  };
}

export function parseJarvisStreamChunk(
  state: JarvisStreamParserState,
  chunk: string,
): JarvisStreamEvent[] {
  state.buffer += chunk;
  const parsed: JarvisStreamEvent[] = [];

  while (true) {
    const newlineIndex = state.buffer.indexOf("\n");

    if (newlineIndex === -1) {
      break;
    }

    const line = state.buffer.slice(0, newlineIndex).trim();
    state.buffer = state.buffer.slice(newlineIndex + 1);

    if (line.length === 0) {
      continue;
    }

    try {
      const event = JSON.parse(line) as JarvisStreamEvent;

      if (!event || typeof event !== "object" || !("type" in event)) {
        state.parseErrors += 1;
        continue;
      }

      parsed.push(event);
      state.events.push(event);
    } catch {
      state.parseErrors += 1;
    }
  }

  return parsed;
}

export function flushJarvisStreamParser(
  state: JarvisStreamParserState,
): JarvisStreamEvent[] {
  const trailing = state.buffer.trim();
  state.buffer = "";

  if (trailing.length === 0) {
    return [];
  }

  return parseJarvisStreamChunk(state, `${trailing}\n`);
}

export function isKnownJarvisStreamEvent(
  event: JarvisStreamEvent,
): event is JarvisStreamEvent {
  return (
    event.type === "thread" ||
    event.type === "delta" ||
    event.type === "reset" ||
    event.type === "status" ||
    event.type === "done" ||
    event.type === "error"
  );
}
