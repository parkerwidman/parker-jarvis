import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";

const ROUTE_PATH = resolve(import.meta.dirname, "route.ts");
const SERVICE_PATH = resolve(
  import.meta.dirname,
  "../../../../../lib/jarvis/integrations/whoop/whoop-webhook-service.ts",
);

const handleWhoopWebhookMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-webhook-service", () => ({
  handleWhoopWebhook: (...args: unknown[]) => handleWhoopWebhookMock(...args),
}));

import { POST } from "./route";

describe("WHOOP webhook route", () => {
  const routeSource = readFileSync(ROUTE_PATH, "utf8");
  const serviceSource = readFileSync(SERVICE_PATH, "utf8");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses node runtime and reads raw body before service handling", () => {
    expect(routeSource).toContain('export const runtime = "nodejs"');
    expect(routeSource).toContain("await request.text()");
    expect(routeSource).not.toContain("getClaims");
    expect(routeSource).not.toContain("createClient");
  });

  it("does not expose webhook payload or secrets in responses", () => {
    expect(routeSource).toContain("{ ok: true }");
    expect(routeSource).not.toContain("trace_id");
    expect(routeSource).not.toContain("JSON.stringify(payload");
    expect(routeSource).not.toContain("WHOOP_CLIENT_SECRET");
    expect(serviceSource).not.toContain("console.log");
    expect(serviceSource).not.toContain("encrypted_access_token");
  });

  it("returns sanitized 502 when the service throws unexpectedly", async () => {
    handleWhoopWebhookMock.mockRejectedValue(new Error("database exploded"));

    const response = await POST(
      new Request("http://localhost/api/integrations/whoop/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });
  });
});
