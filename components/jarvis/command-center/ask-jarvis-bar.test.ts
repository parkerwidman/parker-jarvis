import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AskJarvisBar } from "./ask-jarvis-bar";

describe("AskJarvisBar", () => {
  it("renders quick questions and free-form input independently of briefing", () => {
    const html = renderToStaticMarkup(
      createElement(AskJarvisBar, {
        onSubmit: vi.fn(),
        loading: false,
        error: null,
        lastReply: null,
        followUpUsed: new Set<string>(),
        followUpThread: [],
      }),
    );

    expect(html).toContain("Ask Jarvis — quick questions");
    expect(html).toContain("What&#x27;s overdue?");
    expect(html).toContain("What can wait?");
    expect(html).toContain('placeholder="Ask Jarvis…"');
    expect(html).not.toContain("Your briefing");
    expect(html).not.toContain("briefingDate");
  });
});
