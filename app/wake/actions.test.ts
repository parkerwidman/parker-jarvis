import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesSetMock, redirectMock } = vi.hoisted(() => ({
  cookiesSetMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookiesSetMock,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { continueToJarvisFromRitual } from "@/app/wake/actions";
import { MORNING_RITUAL_BYPASS_COOKIE } from "@/lib/jarvis/rituals/morning-ritual-bypass";

describe("continueToJarvisFromRitual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the same-day bypass cookie and redirects to /", async () => {
    const formData = new FormData();
    formData.set("ritualDate", "2026-08-15");

    await expect(continueToJarvisFromRitual(formData)).rejects.toThrow(
      "REDIRECT:/",
    );

    expect(cookiesSetMock).toHaveBeenCalledWith(
      MORNING_RITUAL_BYPASS_COOKIE,
      "2026-08-15",
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      }),
    );
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("rejects invalid ritual dates without setting a cookie", async () => {
    const formData = new FormData();
    formData.set("ritualDate", "invalid-date");

    await expect(continueToJarvisFromRitual(formData)).rejects.toThrow(
      "REDIRECT:/wake",
    );

    expect(cookiesSetMock).not.toHaveBeenCalled();
  });
});
