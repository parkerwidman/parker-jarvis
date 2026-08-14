import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { MELUSI_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/agent-registry";
import { MAIN_JARVIS_RESPONSE_PRESENTATION } from "@/lib/jarvis/agents/main-response-presentation";
import { buildMainInstructions } from "@/lib/jarvis/context-engine/context-formatters";
import type { JarvisContext } from "@/lib/jarvis/tools/memory-tools";

const baseContext: JarvisContext = {
  profile: {
    timezone: "America/Chicago",
  },
  goals: [],
  memories: [],
  lifeAreas: [],
};

describe("MAIN_JARVIS_RESPONSE_PRESENTATION", () => {
  it("includes adaptive Markdown guidance for Main Jarvis only", () => {
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("Response presentation");
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("For simple questions, answer simply");
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("answer it first");
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("Markdown");
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("tables only when comparing");
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain(
      "Never display successful-action language unless the tool result confirms success",
    );
    expect(MAIN_JARVIS_RESPONSE_PRESENTATION).toContain("Do not infer success from intent");
  });

  it("is included in Main instructions but not Melusi instructions", () => {
    const instructions = buildMainInstructions({
      jarvisContext: baseContext,
      conversationState: null,
      selectedRecordSection: "",
      pendingScheduleSection: "",
      selectedGoals: [],
      selectedMemories: [],
      activeEntities: [],
      sectionsTrimmed: [],
    });

    expect(instructions).toContain("Response presentation");
    expect(MELUSI_JARVIS_INSTRUCTIONS).not.toContain("Response presentation");
  });
});

describe("JarvisChat richAssistantResponses", () => {
  it("renders assistant Markdown only when richAssistantResponses is enabled", () => {
    const richHtml = renderToStaticMarkup(
      createElement(JarvisChat, {
        variant: "fullPage",
        richAssistantResponses: true,
        initialMessages: [
          { role: "user", content: "# Fake heading **bold**" },
          {
            role: "assistant",
            content: "### Result\n\n**Thursday** is the better option.",
          },
        ],
      }),
    );

    expect(richHtml).toContain('class="jarvis-markdown"');
    expect(richHtml).toContain("<h3");
    expect(richHtml).toContain("<strong>Thursday</strong>");
    expect(richHtml).toContain("# Fake heading **bold**");
    expect(richHtml).not.toContain("<h1>Fake heading</h1>");
  });

  it("keeps Melusi-style plain assistant rendering by default", () => {
    const plainHtml = renderToStaticMarkup(
      createElement(JarvisChat, {
        variant: "embedded",
        agentKey: "melusi",
        initialMessages: [
          {
            role: "assistant",
            content: "### Result\n\n**Thursday** is the better option.",
          },
        ],
      }),
    );

    expect(plainHtml).not.toContain('class="jarvis-markdown"');
    expect(plainHtml).toContain("jarvis-bubble-content");
    expect(plainHtml).toContain("### Result");
  });
});
