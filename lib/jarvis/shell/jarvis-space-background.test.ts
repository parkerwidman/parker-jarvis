import { describe, expect, it } from "vitest";

import {
  JARVIS_SPACE_BACKGROUND,
  JARVIS_SPACE_BACKGROUND_SRC,
  getJarvisSpaceBackgroundProfile,
} from "@/lib/jarvis/shell/jarvis-space-background";

describe("getJarvisSpaceBackgroundProfile", () => {
  it("returns the shared Jarvis space environment profile", () => {
    expect(getJarvisSpaceBackgroundProfile()).toEqual(JARVIS_SPACE_BACKGROUND);
  });

  it("renders the wide PNG master directly", () => {
    expect(JARVIS_SPACE_BACKGROUND_SRC).toBe("/jarvis/jarvis-space-source.png");
    expect(JARVIS_SPACE_BACKGROUND.src).toBe("/jarvis/jarvis-space-source.png");
    expect(JARVIS_SPACE_BACKGROUND.width).toBe(1672);
    expect(JARVIS_SPACE_BACKGROUND.height).toBe(941);
  });

  it("does not use legacy background derivatives", () => {
    expect(JARVIS_SPACE_BACKGROUND.src).not.toBe(
      "/jarvis/jarvis-space-environment.webp",
    );
    expect(JARVIS_SPACE_BACKGROUND.src).not.toBe(
      "/jarvis/jarvis-space-source.jpg",
    );
  });
});
