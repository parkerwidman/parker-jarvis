import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROVIDER_PATH = resolve(
  import.meta.dirname,
  "../../../components/jarvis/jarvis-workspace-provider.tsx",
);

function readProviderSource(): string {
  return readFileSync(PROVIDER_PATH, "utf8");
}

describe("JarvisWorkspaceProvider workspace switching", () => {
  const source = readProviderSource();

  it("does not call router.refresh from inside a state updater", () => {
    const setWorkspaceBlock = source.match(
      /const setWorkspace = useCallback\([\s\S]*?\n  \);/,
    )?.[0];

    expect(setWorkspaceBlock).toBeDefined();
    expect(setWorkspaceBlock).not.toContain("router.refresh");
    expect(setWorkspaceBlock).not.toContain("persistWorkspace");
    expect(setWorkspaceBlock).toContain("if (workspace === nextWorkspace)");
    expect(setWorkspaceBlock).toContain("setWorkspaceState(nextWorkspace)");
  });

  it("schedules router.refresh from a post-render effect via startTransition", () => {
    expect(source).toContain("startTransition");
    expect(source).toContain("shouldRefreshRef");
    expect(source).toMatch(
      /useEffect\([\s\S]*?persistWorkspace\(workspace\);[\s\S]*?startTransition\(\(\) => \{[\s\S]*?router\.refresh\(\)/,
    );
  });

  it("skips refresh scheduling when the requested workspace is already active", () => {
    expect(source).toMatch(
      /if \(workspace === nextWorkspace\) \{\s*return;\s*\}/,
    );
    expect(source).toContain("shouldRefreshRef.current = true");
  });

  it("reconciles client persistence in an effect instead of during render", () => {
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*?readPersistedWorkspace\(\)/);
    expect(source).not.toMatch(/render[\s\S]*router\.refresh/);
  });
});
