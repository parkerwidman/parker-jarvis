import type OpenAI from "openai";
import { describe, expect, it } from "vitest";

import {
  buildEmptyFinalFallback,
  createWriteAttemptSummary,
  reconcileFinalRoundText,
  recordWriteAttempt,
} from "@/lib/jarvis/agents/final-response-resolution";

function mockResponse(outputText: string): OpenAI.Responses.Response {
  return {
    output_text: outputText,
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
  } as OpenAI.Responses.Response;
}

describe("reconcileFinalRoundText", () => {
  it("keeps matching streamed and authoritative text", () => {
    const result = reconcileFinalRoundText({
      streamedText: "Hello world",
      response: mockResponse("Hello world"),
    });

    expect(result.finalText).toBe("Hello world");
    expect(result.reconciled).toBe(false);
  });

  it("recovers final text when deltas are empty but completed response has text", () => {
    const result = reconcileFinalRoundText({
      streamedText: "",
      response: mockResponse("The action completed successfully."),
    });

    expect(result.finalText).toBe("The action completed successfully.");
    expect(result.reconciled).toBe(true);
  });

  it("reconciles to authoritative text when streamed prefix is incomplete", () => {
    const result = reconcileFinalRoundText({
      streamedText: "The result is ",
      response: mockResponse("The result is 42."),
    });

    expect(result.finalText).toBe("The result is 42.");
    expect(result.reconciled).toBe(true);
  });
});

describe("buildEmptyFinalFallback", () => {
  it("uses a generic retry message when no writes ran", () => {
    expect(buildEmptyFinalFallback(createWriteAttemptSummary())).toContain(
      "Please try again",
    );
  });

  it("warns against blind retry after write attempts", () => {
    const summary = createWriteAttemptSummary();
    recordWriteAttempt(summary, "create_outlook_calendar_event", JSON.stringify({ success: true }));

    expect(buildEmptyFinalFallback(summary)).toContain("before retrying");
    expect(buildEmptyFinalFallback(summary)).not.toContain("Please try again.");
  });

  it("handles mixed write outcomes", () => {
    const summary = createWriteAttemptSummary();
    recordWriteAttempt(summary, "confirm_pending_schedule_action", JSON.stringify({ success: true }));
    recordWriteAttempt(summary, "create_outlook_calendar_event", JSON.stringify({ success: false }));

    expect(buildEmptyFinalFallback(summary)).toContain("Some action steps completed");
  });
});
