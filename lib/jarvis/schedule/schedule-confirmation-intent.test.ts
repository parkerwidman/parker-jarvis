import { describe, expect, it } from "vitest";

import { detectScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";

describe("detectScheduleConfirmationIntent", () => {
  it("detects affirmative confirmations", () => {
    expect(detectScheduleConfirmationIntent("yes")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("Yeah.")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("do it")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("go ahead")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("make that change")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("sounds good")).toBe("confirm");
    expect(detectScheduleConfirmationIntent("sure")).toBe("confirm");
  });

  it("detects cancellations", () => {
    expect(detectScheduleConfirmationIntent("no")).toBe("cancel");
    expect(detectScheduleConfirmationIntent("cancel that")).toBe("cancel");
    expect(detectScheduleConfirmationIntent("never mind")).toBe("cancel");
    expect(detectScheduleConfirmationIntent("nevermind")).toBe("cancel");
    expect(detectScheduleConfirmationIntent("don't do it")).toBe("cancel");
  });

  it("does not treat negated confirmation phrases as confirm", () => {
    expect(detectScheduleConfirmationIntent("do not do it")).toBe("cancel");
  });

  it("does not treat revision messages as confirmation", () => {
    expect(detectScheduleConfirmationIntent("yes, but make it 4 instead")).toBe("revise");
    expect(detectScheduleConfirmationIntent("actually make it 4")).toBe("revise");
    expect(detectScheduleConfirmationIntent("change it to 4:00")).toBe("revise");
  });

  it("returns unknown for unrelated replies", () => {
    expect(detectScheduleConfirmationIntent("maybe")).toBe("unknown");
    expect(detectScheduleConfirmationIntent("why?")).toBe("unknown");
    expect(detectScheduleConfirmationIntent("what time?")).toBe("unknown");
    expect(detectScheduleConfirmationIntent("tell me about tomorrow")).toBe("unknown");
  });
});
