import { afterEach, describe, expect, it, vi } from "vitest";

import { MORNING_RITUAL_BYPASS_COOKIE } from "@/lib/jarvis/rituals/morning-ritual-bypass-shared";
import {
  buildMorningRitualBypassDocumentCookie,
  setMorningRitualBypassCookieInBrowser,
} from "@/lib/jarvis/rituals/set-morning-ritual-bypass-cookie";

describe("morning ritual bypass browser cookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the exact same-day bypass cookie without Secure outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(buildMorningRitualBypassDocumentCookie("2026-08-15")).toBe(
      `${MORNING_RITUAL_BYPASS_COOKIE}=2026-08-15; Path=/; Max-Age=86400; SameSite=Lax`,
    );
  });

  it("includes Secure in production behavior", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(buildMorningRitualBypassDocumentCookie("2026-08-15")).toBe(
      `${MORNING_RITUAL_BYPASS_COOKIE}=2026-08-15; Path=/; Max-Age=86400; SameSite=Lax; Secure`,
    );
  });

  it("rejects invalid ritual dates", () => {
    expect(buildMorningRitualBypassDocumentCookie("08-15-2026")).toBeNull();
    expect(setMorningRitualBypassCookieInBrowser("08-15-2026")).toBe(false);
  });

  it("writes the bypass cookie to document.cookie", () => {
    let cookieValue = "";
    const cookieSetter = vi.fn((value: string) => {
      cookieValue = value;
    });

    vi.stubGlobal("document", {
      set cookie(value: string) {
        cookieSetter(value);
      },
      get cookie() {
        return cookieValue;
      },
    });

    expect(setMorningRitualBypassCookieInBrowser("2026-08-15")).toBe(true);
    expect(cookieSetter).toHaveBeenCalledWith(
      `${MORNING_RITUAL_BYPASS_COOKIE}=2026-08-15; Path=/; Max-Age=86400; SameSite=Lax`,
    );
  });
});
