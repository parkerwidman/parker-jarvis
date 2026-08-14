import { describe, expect, it } from "vitest";

import { consumeOpenAiResponseStream } from "@/lib/jarvis/agents/openai-response-stream";

async function collectStream(
  events: Array<Record<string, unknown>>,
) {
  async function* generator() {
    for (const event of events) {
      yield event;
    }
  }

  const deltas: string[] = [];
  const resets: number[] = [];

  const result = await consumeOpenAiResponseStream(generator(), {
    onSafeTextDelta: (delta) => deltas.push(delta),
    onResetVisibleText: () => resets.push(1),
  });

  return { result, deltas, resets };
}

describe("consumeOpenAiResponseStream", () => {
  it("uses the completed response as authoritative text when no deltas were emitted", async () => {
    const { result, deltas } = await collectStream([
      {
        type: "response.created",
        response: {
          id: "resp_1",
          output: [],
          output_text: "",
        },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "message",
          content: [{ type: "output_text", text: "" }],
        },
      },
      {
        type: "response.output_text.done",
        output_index: 0,
        content_index: 0,
        text: "The action completed successfully.",
      },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "The action completed successfully." }],
            },
          ],
          output_text: "The action completed successfully.",
        },
      },
    ]);

    expect(deltas).toEqual([]);
    expect(result.authoritativeText).toBe("The action completed successfully.");
    expect(result.hadFunctionCalls).toBe(false);
  });

  it("clears streamed text and resets when a function call appears in the round", async () => {
    const { result, deltas, resets } = await collectStream([
      {
        type: "response.created",
        response: { id: "resp_1", output: [], output_text: "" },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          type: "message",
          content: [{ type: "output_text", text: "" }],
        },
      },
      {
        type: "response.output_text.delta",
        output_index: 0,
        content_index: 0,
        delta: "Drafting",
      },
      {
        type: "response.output_item.added",
        output_index: 1,
        item: {
          type: "function_call",
          name: "confirm_pending_schedule_action",
          arguments: "{}",
          call_id: "call_1",
        },
      },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          output: [
            {
              type: "function_call",
              name: "confirm_pending_schedule_action",
              arguments: "{}",
              call_id: "call_1",
            },
          ],
          output_text: "",
        },
      },
    ]);

    expect(deltas).toEqual(["Drafting"]);
    expect(resets).toHaveLength(1);
    expect(result.hadFunctionCalls).toBe(true);
    expect(result.streamedText).toBe("");
  });
});
