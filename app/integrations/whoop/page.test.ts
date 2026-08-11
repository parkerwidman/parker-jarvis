import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = resolve(import.meta.dirname, "page.tsx");
const DISCONNECT_BUTTON_PATH = resolve(
  import.meta.dirname,
  "../../../components/integrations/whoop-disconnect-button.tsx",
);

describe("/integrations/whoop page", () => {
  const pageSource = readFileSync(PAGE_PATH, "utf8");
  const disconnectSource = readFileSync(DISCONNECT_BUTTON_PATH, "utf8");

  it("requires authentication", () => {
    expect(pageSource).toContain('redirect("/login")');
    expect(pageSource).toContain("getClaims");
  });

  it("shows safe metadata only", () => {
    expect(pageSource).toContain("whoop_connections");
    expect(pageSource).toContain("grantedScopesDisplay");
    expect(pageSource).toContain("lastErrorMessage");
    expect(pageSource).not.toContain("encrypted_access_token");
    expect(pageSource).not.toContain("encrypted_refresh_token");
    expect(pageSource).not.toContain("WHOOP_CLIENT_ID");
    expect(pageSource).not.toContain("WHOOP_CLIENT_SECRET");
    expect(pageSource).not.toContain("remote_revoke_local_cleanup_pending");
  });

  it("links connect to server OAuth route", () => {
    expect(pageSource).toContain("/api/integrations/whoop/connect");
  });

  it("disconnect button does not expose token values", () => {
    expect(disconnectSource).toContain("/api/integrations/whoop/disconnect");
    expect(disconnectSource).not.toContain("accessToken");
    expect(disconnectSource).not.toContain("refreshToken");
    expect(disconnectSource).not.toContain("WHOOP_CLIENT");
  });
});
