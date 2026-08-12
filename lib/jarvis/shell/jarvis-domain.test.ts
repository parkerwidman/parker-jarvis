import { describe, expect, it } from "vitest";

import {
  getJarvisBackdropVariant,
  getJarvisNavDomain,
  getJarvisVisualDomain,
} from "@/lib/jarvis/shell/jarvis-domain";

describe("getJarvisVisualDomain", () => {
  it("maps goal routes to goals", () => {
    expect(getJarvisVisualDomain("/goals/short-term")).toBe("goals");
  });

  it("maps melusi routes to melusi", () => {
    expect(getJarvisVisualDomain("/melusi/threads")).toBe("melusi");
  });

  it("maps fitness routes to fitness", () => {
    expect(getJarvisVisualDomain("/fitness")).toBe("fitness");
  });

  it("maps assistant routes to assistant", () => {
    expect(getJarvisVisualDomain("/assistant")).toBe("assistant");
  });

  it("defaults other routes to default", () => {
    expect(getJarvisVisualDomain("/")).toBe("default");
    expect(getJarvisVisualDomain("/plans")).toBe("default");
  });
});

describe("getJarvisBackdropVariant", () => {
  it("uses subtle accent on assistant routes", () => {
    expect(getJarvisBackdropVariant("/assistant")).toBe("subtle");
  });

  it("uses no page accent on Command Center", () => {
    expect(getJarvisBackdropVariant("/")).toBe("none");
  });

  it("uses domain accents on section routes", () => {
    expect(getJarvisBackdropVariant("/fitness")).toBe("fitness");
    expect(getJarvisBackdropVariant("/goals/short-term")).toBe("goals");
    expect(getJarvisBackdropVariant("/melusi")).toBe("melusi");
  });
});

describe("getJarvisNavDomain", () => {
  it("derives nav domain accents from href", () => {
    expect(getJarvisNavDomain("/goals/short-term")).toBe("goals");
    expect(getJarvisNavDomain("/melusi")).toBe("melusi");
    expect(getJarvisNavDomain("/fitness")).toBe("fitness");
    expect(getJarvisNavDomain("/assistant")).toBe("assistant");
    expect(getJarvisNavDomain("/")).toBe("jarvis");
  });
});
