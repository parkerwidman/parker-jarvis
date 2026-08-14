import { describe, expect, it } from "vitest";

import { isSafeMarkdownHref } from "@/lib/jarvis/response/safe-markdown-link";

describe("isSafeMarkdownHref", () => {
  it("allows http, https, mailto, relative, hash, and tel links", () => {
    expect(isSafeMarkdownHref("https://example.com")).toBe(true);
    expect(isSafeMarkdownHref("http://example.com/path")).toBe(true);
    expect(isSafeMarkdownHref("mailto:parker@example.com")).toBe(true);
    expect(isSafeMarkdownHref("/assistant")).toBe(true);
    expect(isSafeMarkdownHref("#section")).toBe(true);
    expect(isSafeMarkdownHref("tel:+15551234567")).toBe(true);
  });

  it("blocks javascript, data, vbscript, file, and protocol-relative URLs", () => {
    expect(isSafeMarkdownHref("javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeMarkdownHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeMarkdownHref("file:///etc/passwd")).toBe(false);
    expect(isSafeMarkdownHref("//evil.example.com")).toBe(false);
  });

  it("rejects empty or missing href values", () => {
    expect(isSafeMarkdownHref("")).toBe(false);
    expect(isSafeMarkdownHref("   ")).toBe(false);
    expect(isSafeMarkdownHref(null)).toBe(false);
    expect(isSafeMarkdownHref(undefined)).toBe(false);
  });
});
