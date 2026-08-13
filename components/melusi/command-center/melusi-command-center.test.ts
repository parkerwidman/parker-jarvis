import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMelusiCreateNextActionHref } from "@/components/melusi/command-center/melusi-status-rail";

const ROOT = resolve(import.meta.dirname, "../../..");

describe("Melusi Command Center dashboard", () => {
  it("uses the main + rail grid layout on the overview page", () => {
    const pageSource = readFileSync(resolve(ROOT, "app/melusi/page.tsx"), "utf8");

    expect(pageSource).toContain("MelusiCommandCenterDashboard");
    expect(pageSource).not.toContain("melusi-dash-layout");
  });

  it("renders the redesigned dashboard sections", () => {
    const componentSource = readFileSync(
      resolve(ROOT, "components/melusi/command-center/melusi-command-center-dashboard.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("MelusiCommandCenterHeader");
    expect(componentSource).toContain("MelusiBusinessPrioritySection");
    expect(componentSource).toContain("MelusiTasksSection");
    expect(componentSource).toContain("MelusiActiveProjectsSection");
    expect(componentSource).toContain("MelusiBusinessSnapshotStrip");
    expect(componentSource).toContain("MelusiNeedsAttentionSection");
    expect(componentSource).toContain("jarvisPanel");
    expect(componentSource).toContain("MelusiStatusRail");
  });

  it("defines the melusi dashboard grid in CSS", () => {
    const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");

    expect(css).toContain(".melusi-dash-grid");
    expect(css).toMatch(/\.melusi-dash-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*17rem/);
    expect(css).toContain(".melusi-dash-rail");
    expect(css).toContain(".melusi-kpi-strip");
    expect(css).toContain(".melusi-priority-hero");
  });

  it("does not introduce fake revenue metrics in the rail", () => {
    const railSource = readFileSync(
      resolve(ROOT, "components/melusi/command-center/melusi-status-rail.tsx"),
      "utf8",
    );

    expect(railSource).not.toContain("revenue");
    expect(railSource).toContain('href: "/briefings"');
    expect(railSource).toContain('href: "/plans"');
    expect(railSource).toContain('href: "/approvals"');
  });
});

describe("resolveMelusiCreateNextActionHref", () => {
  it("routes project-planning priorities to the project workspace", () => {
    expect(
      resolveMelusiCreateNextActionHref({
        kind: "project-planning",
        projectId: "project-1",
        projectName: "Create 1st Video",
        selectionReason: "Active project with no next action assigned",
        nextAction: "Open the project workspace and assign the next task.",
      }),
    ).toBe("/melusi/projects/project-1");
  });

  it("falls back to threads when no project destination exists", () => {
    expect(resolveMelusiCreateNextActionHref(null)).toBe("/melusi/threads");
  });
});
