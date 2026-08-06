import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { getPlaidEnvironmentMock } = vi.hoisted(() => ({
  getPlaidEnvironmentMock: vi.fn<[], "sandbox" | "production">(),
}));

vi.mock("@/lib/jarvis/integrations/plaid/plaid-config", () => ({
  getPlaidEnvironment: () => getPlaidEnvironmentMock(),
}));

import { loadEligiblePlaidConnectionIdsForUser } from "@/lib/jarvis/integrations/plaid/plaid-sync-service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTED_ID = "22222222-2222-4222-8222-222222222222";
const WRONG_ENV_ID = "33333333-3333-4333-8333-333333333333";
const DISCONNECTED_ID = "44444444-4444-4444-8444-444444444444";
const RECONNECT_ID = "55555555-5555-4555-8555-555555555555";
const MISSING_TOKEN_ID = "66666666-6666-4666-8666-666666666666";

type ConnectionRow = {
  id: string;
  status: string;
  environment: string;
  encrypted_access_token: string | null;
};

function createSupabaseMock(rows: ConnectionRow[]): SupabaseClient {
  const filters: Record<string, string | boolean> = {};

  const builder = {
    eq(column: string, value: string) {
      filters[column] = value;
      return builder;
    },
    not(column: string, operator: string, value: null) {
      if (column === "encrypted_access_token" && operator === "is" && value === null) {
        filters.requireEncryptedToken = true;
      }
      return builder;
    },
    order() {
      const data = rows
        .filter((row) => filters.user_id === undefined || row.id && filters.user_id === USER_ID)
        .filter(
          (row) =>
            filters.environment === undefined ||
            row.environment === filters.environment,
        )
        .filter((row) => filters.status === undefined || row.status === filters.status)
        .filter(
          (row) =>
            !filters.requireEncryptedToken || row.encrypted_access_token !== null,
        )
        .map((row) => ({ id: row.id }));

      return Promise.resolve({ data, error: null });
    },
  };

  return {
    from(table: string) {
      if (table !== "plaid_connections") {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select() {
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("loadEligiblePlaidConnectionIdsForUser", () => {
  beforeEach(() => {
    getPlaidEnvironmentMock.mockReturnValue("production");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("includes connected current-environment connections with encrypted tokens", async () => {
    const supabase = createSupabaseMock([
      {
        id: CONNECTED_ID,
        status: "connected",
        environment: "production",
        encrypted_access_token: "encrypted",
      },
      {
        id: WRONG_ENV_ID,
        status: "connected",
        environment: "sandbox",
        encrypted_access_token: "encrypted",
      },
      {
        id: DISCONNECTED_ID,
        status: "disconnected",
        environment: "production",
        encrypted_access_token: "encrypted",
      },
      {
        id: RECONNECT_ID,
        status: "reconnect_required",
        environment: "production",
        encrypted_access_token: "encrypted",
      },
      {
        id: MISSING_TOKEN_ID,
        status: "connected",
        environment: "production",
        encrypted_access_token: null,
      },
    ]);

    const connectionIds = await loadEligiblePlaidConnectionIdsForUser(
      supabase,
      USER_ID,
    );

    expect(connectionIds).toEqual([CONNECTED_ID]);
  });

  it("excludes wrong-environment connections during production cron execution", async () => {
    getPlaidEnvironmentMock.mockReturnValue("production");

    const supabase = createSupabaseMock([
      {
        id: WRONG_ENV_ID,
        status: "connected",
        environment: "sandbox",
        encrypted_access_token: "encrypted",
      },
    ]);

    const connectionIds = await loadEligiblePlaidConnectionIdsForUser(
      supabase,
      USER_ID,
    );

    expect(connectionIds).toEqual([]);
  });

  it("excludes disconnected connections", async () => {
    const supabase = createSupabaseMock([
      {
        id: DISCONNECTED_ID,
        status: "disconnected",
        environment: "production",
        encrypted_access_token: "encrypted",
      },
    ]);

    expect(
      await loadEligiblePlaidConnectionIdsForUser(supabase, USER_ID),
    ).toEqual([]);
  });

  it("excludes reconnect_required connections", async () => {
    const supabase = createSupabaseMock([
      {
        id: RECONNECT_ID,
        status: "reconnect_required",
        environment: "production",
        encrypted_access_token: "encrypted",
      },
    ]);

    expect(
      await loadEligiblePlaidConnectionIdsForUser(supabase, USER_ID),
    ).toEqual([]);
  });

  it("excludes connected connections missing encrypted tokens", async () => {
    const supabase = createSupabaseMock([
      {
        id: MISSING_TOKEN_ID,
        status: "connected",
        environment: "production",
        encrypted_access_token: null,
      },
    ]);

    expect(
      await loadEligiblePlaidConnectionIdsForUser(supabase, USER_ID),
    ).toEqual([]);
  });
});
