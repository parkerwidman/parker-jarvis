import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

describe("Command Center page layout", () => {
  it("uses the cc2 shell on the home page main region", () => {
    const pageSource = readFileSync(resolve(ROOT, "app/page.tsx"), "utf8");

    expect(pageSource).toContain('mainClassName="app-main--command-center cc2-shell"');
    expect(pageSource).toContain("CommandCenterDashboard");
  });

  it("avoids nested viewport-height scrolling and flex-stretched empty space", () => {
    const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");

    expect(css).toContain(".app-main.app-main--command-center.cc2-shell");
    expect(css).toContain("height: auto");
    expect(css).toContain(".app-shell:has(.app-main--command-center.cc2-shell)");
    expect(css).toMatch(/\.cc2-main\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(/\.cc2-main\s*\{[^}]*flex:\s*1/);
  });
});
