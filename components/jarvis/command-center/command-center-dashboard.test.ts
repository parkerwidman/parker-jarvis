import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DASHBOARD_PATH = resolve(
  import.meta.dirname,
  "command-center-dashboard.tsx",
);

describe("CommandCenterDashboard briefing date wiring", () => {
  it("passes the displayed briefing date instead of todayDate", () => {
    const source = readFileSync(DASHBOARD_PATH, "utf8");

    expect(source).toContain("data.briefing?.briefingDate");
    expect(source).toContain("data.briefingTranscript");
    expect(source).not.toMatch(/briefingDate=\{data\.todayDate\}/);
  });
});
