import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = resolve(import.meta.dirname, "page.tsx");
const DASHBOARD_PATH = resolve(
  import.meta.dirname,
  "../../components/fitness/fitness-dashboard.tsx",
);
const SIDEBAR_PATH = resolve(
  import.meta.dirname,
  "../../components/jarvis/jarvis-sidebar.tsx",
);

describe("/fitness route", () => {
  const pageSource = readFileSync(PAGE_PATH, "utf8");
  const dashboardSource = readFileSync(DASHBOARD_PATH, "utf8");
  const sidebarSource = readFileSync(SIDEBAR_PATH, "utf8");

  it("requires authentication", () => {
    expect(pageSource).toContain('redirect("/login")');
    expect(pageSource).toContain("getClaims");
  });

  it("does not accept userId from client input", () => {
    expect(pageSource).not.toContain("searchParams");
    expect(pageSource).not.toContain("params.userId");
  });

  it("is linked from primary navigation", () => {
    expect(sidebarSource).toContain('href: "/fitness"');
  });

  it("does not render raw provider payloads or secrets", () => {
    expect(dashboardSource).not.toContain("raw_payload");
    expect(dashboardSource).not.toContain("whoop_workout_id");
    expect(dashboardSource).not.toContain("encrypted_");
    expect(dashboardSource).not.toContain("WHOOP_CLIENT");
  });
});
