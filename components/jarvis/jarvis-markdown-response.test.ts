import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JarvisMarkdownResponse } from "@/components/jarvis/jarvis-markdown-response";

function renderMarkdown(content: string): string {
  return renderToStaticMarkup(
    createElement(JarvisMarkdownResponse, { content }),
  );
}

describe("JarvisMarkdownResponse", () => {
  it("renders a normal paragraph", () => {
    const html = renderMarkdown("Plain answer text.");

    expect(html).toContain('class="jarvis-markdown"');
    expect(html).toContain("<p>Plain answer text.</p>");
  });

  it("renders headings, emphasis, and lists", () => {
    const html = renderMarkdown(`# Title

**Bold** and *italic*

- Item one
- Item two

1. First
2. Second
  - Nested`);

    expect(html).toContain("<h1");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("Item one");
    expect(html).toContain("Nested");
  });

  it("renders tables with a scroll wrapper", () => {
    const html = renderMarkdown(`| Option | Cost |
| --- | ---: |
| Basic | $20 |`);

    expect(html).toContain('class="jarvis-markdown-table-wrap"');
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("Basic");
  });

  it("renders inline and fenced code", () => {
    const html = renderMarkdown("Use `npm test` then:\n\n```typescript\nfunction add(a: number, b: number) {\n  return a + b;\n}\n```");

    expect(html).toContain('class="jarvis-markdown-inline-code"');
    expect(html).toContain('class="jarvis-markdown-pre"');
    expect(html).toContain("language-typescript");
    expect(html).toContain("return a + b");
  });

  it("renders blockquotes, dividers, and checklists", () => {
    const html = renderMarkdown(`> **Best window:** 2:15–4:15 PM

---

- [x] Complete
- [ ] Remaining`);

    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).toContain("readOnly");
  });

  it("renders safe external links with rel and target", () => {
    const html = renderMarkdown("[Docs](https://example.com/docs)");

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("does not render unsafe javascript links as anchors", () => {
    const html = renderMarkdown("[bad](javascript:alert(1))");

    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain("<a ");
    expect(html).toContain("bad");
  });

  it("treats raw HTML and script tags as inert text", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders historical plain-text responses unchanged in structure", () => {
    const html = renderMarkdown("Your workout is at 9:30 AM tomorrow.");

    expect(html).toContain("<p>Your workout is at 9:30 AM tomorrow.</p>");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<table");
  });

  it("preserves persisted markdown source semantics on reopen", () => {
    const source = `### Heading

**Bold**

- Item one
- Item two`;

    const html = renderMarkdown(source);

    expect(html).toContain("<h3");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("Item one");
    expect(html).toContain("Item two");
  });

  it("contains overflow wrappers for tables and code blocks", () => {
    const html = renderMarkdown("```\n" + "x".repeat(240) + "\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");

    expect(html).toContain('class="jarvis-markdown-pre"');
    expect(html).toContain('class="jarvis-markdown-table-wrap"');
  });
});

describe("JarvisMarkdownResponse security", () => {
  it("does not use dangerouslySetInnerHTML in the renderer module", async () => {
    const moduleSource = await import("node:fs/promises").then((fs) =>
      fs.readFile("components/jarvis/jarvis-markdown-response.tsx", "utf8"),
    );

    expect(moduleSource).not.toContain("dangerouslySetInnerHTML");
  });
});
