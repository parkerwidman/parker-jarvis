import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("loadFitnessTodaySnapshot", () => {
  const loaderSource = readSource(
    "lib/jarvis/fitness/load-fitness-today-snapshot.ts",
  );

  it("reads stored WHOOP tables only and excludes raw payloads", () => {
    expect(loaderSource).toContain('.from("whoop_connections")');
    expect(loaderSource).toContain('.from("whoop_cycles")');
    expect(loaderSource).toContain('.from("whoop_recoveries")');
    expect(loaderSource).toContain('.from("whoop_sleeps")');
    expect(loaderSource).toContain('.from("whoop_workouts")');
    expect(loaderSource).toContain('.from("whoop_body_measurements")');
    expect(loaderSource).not.toContain("raw_payload");
    expect(loaderSource).not.toContain("whoop_connection_credentials");
    expect(loaderSource).not.toContain("fetchWhoop");
    expect(loaderSource).not.toContain("getValidWhoopAccessToken");
  });

  it("uses profile timezone helpers for today semantics", () => {
    expect(loaderSource).toContain("resolveTimeZone");
    expect(loaderSource).toContain("getLocalDateString");
    expect(loaderSource).toContain("selectRecoveryForToday");
    expect(loaderSource).toContain("selectSleepForToday");
    expect(loaderSource).toContain("selectCycleForToday");
    expect(loaderSource).toContain("selectWorkoutsForToday");
  });
});

describe("/fitness page", () => {
  const pageSource = readSource("app/fitness/page.tsx");
  const dashboardSource = readSource("components/fitness/fitness-dashboard.tsx");
  const syncControlsSource = readSource(
    "components/fitness/fitness-sync-controls.tsx",
  );
  const syncButtonSource = readSource(
    "components/integrations/whoop-sync-button.tsx",
  );

  it("requires authentication and loads the current user snapshot", () => {
    expect(pageSource).toContain('redirect("/login")');
    expect(pageSource).toContain("getClaims");
    expect(pageSource).toContain("loadFitnessTodaySnapshot(supabase, userId)");
    expect(pageSource).not.toContain("searchParams");
  });

  it("shows disconnected onboarding without crashing", () => {
    expect(dashboardSource).toContain("WHOOP isn't connected");
    expect(dashboardSource).toContain("/integrations/whoop");
  });

  it("reuses the existing WHOOP sync route and refreshes after success", () => {
    expect(syncControlsSource).toContain("WhoopSyncButton");
    expect(syncButtonSource).toContain("/api/integrations/whoop/sync");
    expect(syncButtonSource).toContain("router.refresh()");
    expect(syncControlsSource).not.toContain("accessToken");
    expect(dashboardSource).not.toContain("raw_payload");
    expect(dashboardSource).not.toContain("WHOOP_CLIENT_SECRET");
    expect(dashboardSource).not.toContain("WHOOP_TOKEN_ENCRYPTION_KEY");
  });
});
