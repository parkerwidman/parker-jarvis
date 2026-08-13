import { describe, expect, it } from "vitest";
import {
  defaultJarvisWorkspace,
  parseJarvisWorkspace,
  serializeWorkspaceCookie,
} from "./jarvis-workspace";

describe("jarvis workspace", () => {
  it("defaults to melusi when no persisted value exists", () => {
    expect(defaultJarvisWorkspace()).toBe("melusi");
    expect(parseJarvisWorkspace(null)).toBe("melusi");
    expect(parseJarvisWorkspace(undefined)).toBe("melusi");
    expect(parseJarvisWorkspace("")).toBe("melusi");
  });

  it("parses personal explicitly", () => {
    expect(parseJarvisWorkspace("personal")).toBe("personal");
  });

  it("serializes a safe workspace cookie", () => {
    expect(serializeWorkspaceCookie("personal")).toContain("jarvis-workspace=personal");
    expect(serializeWorkspaceCookie("personal")).toContain("SameSite=Lax");
  });
});
