import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  generateInnerBars,
  generateOuterBars,
  generateTicks,
  getRingColor,
  INNER_BAR_COUNT,
  INNER_BARS,
  OUTER_BAR_COUNT,
  OUTER_BARS,
  RING_COLORS,
  RING_TICKS,
  TICK_COUNT,
} from "@/lib/jarvis/morning-ritual/ring-geometry";

const ROOT = resolve(import.meta.dirname, "../../..");
const RING_GEOMETRY_PATH = resolve(
  ROOT,
  "lib/jarvis/morning-ritual/ring-geometry.ts",
);
const RITUAL_RING_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/ritual-ring.tsx",
);

describe("ring geometry", () => {
  it("generates exactly 60 outer bars", () => {
    expect(OUTER_BARS).toHaveLength(60);
    expect(generateOuterBars()).toHaveLength(OUTER_BAR_COUNT);
  });

  it("generates exactly 40 inner bars", () => {
    expect(INNER_BARS).toHaveLength(40);
    expect(generateInnerBars()).toHaveLength(INNER_BAR_COUNT);
  });

  it("generates exactly 24 ticks", () => {
    expect(RING_TICKS).toHaveLength(24);
    expect(generateTicks()).toHaveLength(TICK_COUNT);
  });

  it("marks every fourth tick as major", () => {
    for (const tick of RING_TICKS) {
      expect(tick.isMajor).toBe(tick.index % 4 === 0);
    }
  });

  it("produces deterministic geometry for the same seed", () => {
    const first = generateOuterBars("test-seed");
    const second = generateOuterBars("test-seed");
    expect(first).toEqual(second);
  });

  it("does not use Math.random in the render path", () => {
    const source = readFileSync(RING_GEOMETRY_PATH, "utf8");
    expect(source).not.toMatch(/Math\.random/);
  });

  it("uses neutral ring color before reveal", () => {
    expect(getRingColor(null, false)).toBe(RING_COLORS.neutral);
    expect(getRingColor("melusi", false)).toBe(RING_COLORS.neutral);
    expect(getRingColor("personal", false)).toBe(RING_COLORS.neutral);
  });

  it("reveals Melusi accent as #3B7DDD", () => {
    expect(getRingColor("melusi", true)).toBe("#3B7DDD");
  });

  it("reveals Personal accent as #F0A93B", () => {
    expect(getRingColor("personal", true)).toBe("#F0A93B");
  });
});

describe("ritual ring component source", () => {
  it("does not use Math.random during render", () => {
    const source = readFileSync(RITUAL_RING_PATH, "utf8");
    expect(source).not.toMatch(/Math\.random/);
  });

  it("includes radar sweep and orbit dots", () => {
    const source = readFileSync(RITUAL_RING_PATH, "utf8");
    expect(source).toContain('data-testid="ritual-radar-sweep"');
    expect(source).toContain('data-testid="ritual-orbit-dot"');
  });

  it("uses opposite rotation directions for inner and outer bar groups", () => {
    const cssPath = resolve(
      ROOT,
      "components/jarvis/morning-ritual/morning-ritual.module.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("outerBarsRotate");
    expect(css).toContain("innerBarsRotate");
    expect(css).toMatch(/outerBarsRotate[\s\S]*rotate\(360deg\)/);
    expect(css).toMatch(/innerBarsRotate[\s\S]*rotate\(-360deg\)/);
  });
});
