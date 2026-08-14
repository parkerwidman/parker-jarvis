import {
  createJarvisStreamParserState,
  flushJarvisStreamParser,
  parseJarvisStreamChunk,
} from "@/lib/jarvis/streaming/stream-parser";
import type { JarvisStreamEvent } from "@/lib/jarvis/streaming/stream-events";

export type ConsumeJarvisAssistantStreamCallbacks = {
  onEvent?: (event: JarvisStreamEvent) => void;
  onThread?: (threadId: string) => void;
  onDelta?: (delta: string) => void;
  onReset?: () => void;
  onDone?: (payload: { threadId: string; reply: string; requestId: string }) => void;
  onError?: (payload: { code: string; message: string; requestId?: string }) => void;
};

export type ConsumeJarvisAssistantStreamResult =
  | {
      success: true;
      threadId: string;
      reply: string;
      requestId: string;
    }
  | {
      success: false;
      code: string;
      message: string;
      requestId?: string;
    };

export async function consumeJarvisAssistantStream(
  response: Response,
  callbacks: ConsumeJarvisAssistantStreamCallbacks = {},
): Promise<ConsumeJarvisAssistantStreamResult> {
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";

    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.length > 0) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse failures for error bodies.
    }

    return {
      success: false,
      code: "http_error",
      message,
    };
  }

  if (!response.body) {
    return {
      success: false,
      code: "missing_stream_body",
      message: "Something went wrong. Please try again.",
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parserState = createJarvisStreamParserState();

  let threadId: string | null = null;
  let reply = "";
  let requestId = "";
  let failure: ConsumeJarvisAssistantStreamResult | null = null;

  const handleEvent = (event: JarvisStreamEvent) => {
    callbacks.onEvent?.(event);

    switch (event.type) {
      case "thread":
        threadId = event.threadId;
        callbacks.onThread?.(event.threadId);
        break;
      case "delta":
        callbacks.onDelta?.(event.delta);
        break;
      case "reset":
        reply = "";
        callbacks.onReset?.();
        break;
      case "done":
        threadId = event.threadId;
        reply = event.reply;
        requestId = event.requestId;
        callbacks.onDone?.({
          threadId: event.threadId,
          reply: event.reply,
          requestId: event.requestId,
        });
        break;
      case "error":
        failure = {
          success: false,
          code: event.code,
          message: event.message,
          requestId: event.requestId,
        };
        callbacks.onError?.({
          code: event.code,
          message: event.message,
          requestId: event.requestId,
        });
        break;
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    const events = parseJarvisStreamChunk(parserState, chunk);
    events.forEach(handleEvent);
  }

  const trailingEvents = flushJarvisStreamParser(parserState);
  trailingEvents.forEach(handleEvent);

  if (failure) {
    return failure;
  }

  if (!threadId || reply.length === 0) {
    return {
      success: false,
      code: "incomplete_stream",
      message: "The response ended unexpectedly. Please try again.",
      requestId: requestId || undefined,
    };
  }

  return {
    success: true,
    threadId,
    reply,
    requestId,
  };
}

export function createStreamDeltaBatcher(
  onFlush: (content: string) => void,
  getContent: () => string,
): {
  append: (delta: string) => void;
  reset: () => void;
  flushNow: () => void;
} {
  let pending = "";
  let frame: number | null = null;

  const flushNow = () => {
    if (frame !== null) {
      if (typeof cancelAnimationFrame === "function" && frame > 0) {
        cancelAnimationFrame(frame);
      }
      frame = null;
    }

    if (pending.length === 0) {
      return;
    }

    const next = `${getContent()}${pending}`;
    pending = "";
    onFlush(next);
  };

  const schedule = () => {
    if (frame !== null) {
      return;
    }

    const run = () => {
      frame = null;
      flushNow();
    };

    if (typeof requestAnimationFrame === "function") {
      frame = requestAnimationFrame(run);
      return;
    }

    frame = -1;
    setTimeout(run, 0);
  };

  return {
    append(delta: string) {
      pending += delta;
      schedule();
    },
    reset() {
      pending = "";
      if (frame !== null) {
        if (typeof cancelAnimationFrame === "function" && frame > 0) {
          cancelAnimationFrame(frame);
        }
        frame = null;
      }
      onFlush("");
    },
    flushNow,
  };
}
