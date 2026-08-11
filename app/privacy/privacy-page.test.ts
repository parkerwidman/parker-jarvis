import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const PRIVACY_PAGE_PATH = resolve(import.meta.dirname, "page.tsx");
const PROXY_PATH = resolve(ROOT, "proxy.ts");
const PROXY_LIB_PATH = resolve(ROOT, "lib/supabase/proxy.ts");

describe("public /privacy page", () => {
  const source = readFileSync(PRIVACY_PAGE_PATH, "utf8");

  it("exists at app/privacy/page.tsx", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it("is public and not behind the authenticated shell", () => {
    expect(source).not.toContain('redirect("/login")');
    expect(source).not.toContain("JarvisAppShell");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("getClaims");
    expect(source).not.toContain("supabase");
  });

  it('contains "Jarvis Privacy Policy"', () => {
    expect(source).toContain("Jarvis Privacy Policy");
  });

  it("includes WHOOP", () => {
    expect(source).toMatch(/WHOOP/);
  });

  it("includes recovery, sleep, workout, and body measurement concepts", () => {
    expect(source).toMatch(/recovery/i);
    expect(source).toMatch(/sleep/i);
    expect(source).toMatch(/workout/i);
    expect(source).toMatch(/body measurement/i);
  });

  it("states personal data is not sold", () => {
    expect(source).toMatch(/not sold/i);
  });

  it("mentions revoking WHOOP access", () => {
    expect(source).toMatch(/revok/i);
    expect(source).toMatch(/WHOOP/);
  });

  it("does not claim HIPAA compliance", () => {
    expect(source).not.toMatch(/HIPAA/i);
  });

  it("does not expose secret env variable names", () => {
    expect(source).not.toContain("WHOOP_TOKEN_ENCRYPTION_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_");
    expect(source).not.toContain("process.env");
  });

  it("does not add OAuth implementation", () => {
    expect(source).not.toMatch(/from ["']@\/lib\/jarvis\/integrations\/whoop/);
    expect(source).not.toMatch(/\/api\/.*whoop/i);

    const whoopApiRoute = resolve(ROOT, "app/api/whoop");
    const whoopConnectRoute = resolve(ROOT, "app/connections/whoop");

    expect(existsSync(whoopApiRoute)).toBe(false);
    expect(existsSync(whoopConnectRoute)).toBe(false);
  });
});

describe("privacy routing and auth", () => {
  it("proxy refreshes sessions without global login redirects", () => {
    const proxySource = readFileSync(PROXY_PATH, "utf8");
    const proxyLibSource = readFileSync(PROXY_LIB_PATH, "utf8");

    expect(proxySource).toContain("updateSession");
    expect(proxyLibSource).not.toContain('redirect("/login")');
    expect(proxyLibSource).not.toContain("/privacy");
  });
});
