import { describe, expect, it } from "vitest";

import { deriveConversationTitle } from "@/lib/jarvis/conversations/conversation-title";

describe("deriveConversationTitle", () => {
  it("uses the first meaningful line with ellipsis when long", () => {
    const title = deriveConversationTitle(
      "Add a recurring block called D7.6 Recurring Test every Tuesday from 12:30 to 1:00 PM for my current schedule.",
    );

    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).toContain("D7.6 Recurring Test");
  });

  it("returns the full short message unchanged", () => {
    expect(deriveConversationTitle("What should I work on for Melusi today?")).toBe(
      "What should I work on for Melusi today?",
    );
  });

  it("strips control characters from titles", () => {
    expect(deriveConversationTitle("Hello\u0000world")).toBe("Helloworld");
  });
});
