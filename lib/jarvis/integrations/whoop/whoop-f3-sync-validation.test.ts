import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const VALIDATION_PATH = "supabase/tests/whoop_f3_sync_validation.sql";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("WHOOP F3 sync SQL validation", () => {
  const validation = readSource(VALIDATION_PATH);

  it("covers atomic claim, stale reclaim, and score-state transitions", () => {
    expect(validation).toContain("first claim did not win exactly one row");
    expect(validation).toContain("second claim should not win while in progress");
    expect(validation).toContain("stale claim did not succeed");
    expect(validation).toContain("cycle metrics were not cleared");
    expect(validation).toContain("sleep metrics were not cleared");
    expect(validation).toContain("recovery metrics were not cleared");
    expect(validation).toContain("workout metrics were not cleared");
  });
});
