import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const MIGRATION_PATH =
  "supabase/migrations/20260809100000_add_whoop_foundation.sql";
const VALIDATION_PATH = "supabase/tests/whoop_foundation_validation.sql";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("WHOOP F1 foundation migration", () => {
  const migration = readSource(MIGRATION_PATH);
  const migrationSql = sqlWithoutComments(migration);
  const validation = readSource(VALIDATION_PATH);
  const typesSource = readSource("lib/jarvis/integrations/whoop/whoop-types.ts");
  const cryptoSource = readSource(
    "lib/jarvis/integrations/whoop/whoop-token-crypto.ts",
  );

  it("creates split connection metadata and server-only credentials tables", () => {
    expect(migration).toContain("CREATE TABLE public.whoop_connections");
    expect(migration).toContain("CREATE TABLE public.whoop_connection_credentials");

    const connectionsBlock =
      migration.match(
        /CREATE TABLE public\.whoop_connections[\s\S]*?;\s*\n\nALTER TABLE public\.whoop_connections/,
      )?.[0] ?? "";

    expect(connectionsBlock).not.toContain("encrypted_access_token");
    expect(connectionsBlock).not.toContain("encrypted_refresh_token");
  });

  it("creates metric and webhook tables with raw_payload jsonb", () => {
    expect(migration).toContain("CREATE TABLE public.whoop_cycles");
    expect(migration).toContain("CREATE TABLE public.whoop_sleeps");
    expect(migration).toContain("CREATE TABLE public.whoop_recoveries");
    expect(migration).toContain("CREATE TABLE public.whoop_workouts");
    expect(migration).toContain("CREATE TABLE public.whoop_body_measurements");
    expect(migration).toContain("CREATE TABLE public.whoop_webhook_events");
    expect(migration).toContain("raw_payload               jsonb");
  });

  it("grants authenticated SELECT only on safe metadata and metrics", () => {
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.whoop_connections TO authenticated",
    );
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.whoop_cycles TO authenticated",
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*whoop_connections.*authenticated/i,
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*whoop_cycles.*authenticated/i,
    );
  });

  it("blocks authenticated and anon access to credentials and webhook events", () => {
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.whoop_connection_credentials FROM authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.whoop_webhook_events FROM authenticated",
    );
    expect(migration).not.toMatch(/CREATE POLICY[^;]*whoop_connection_credentials/);
    expect(migration).not.toMatch(/CREATE POLICY[^;]*whoop_webhook_events/);
  });

  it("grants service_role CRUD on all WHOOP tables", () => {
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE");
    expect(migration).toContain("public.whoop_connection_credentials");
    expect(migration).toContain("public.whoop_webhook_events");
  });

  it("installs provider unique keys without brittle cross-resource FKs", () => {
    expect(migration).toContain("whoop_connections_user_id_key UNIQUE (user_id)");
    expect(migration).toContain("whoop_cycles_user_id_whoop_cycle_id_key");
    expect(migration).toContain("whoop_sleeps_user_id_whoop_sleep_id_key");
    expect(migration).toContain("whoop_recoveries_user_id_whoop_sleep_id_key");
    expect(migration).toContain("whoop_workouts_user_id_whoop_workout_id_key");
    expect(migration).toContain("whoop_webhook_events_trace_id_key UNIQUE (trace_id)");
    expect(migrationSql).not.toMatch(
      /FOREIGN KEY \(whoop_cycle_id\) REFERENCES public\.whoop_cycles/i,
    );
  });

  it("types keep safe metadata separate from credential rows", () => {
    expect(typesSource).toContain("export type WhoopConnectionRow");
    expect(typesSource).toContain("export type WhoopConnectionCredentialsRow");

    const connectionRowBlock =
      typesSource.match(/export type WhoopConnectionRow = \{[\s\S]*?\};/)?.[0] ??
      "";

    expect(connectionRowBlock).not.toContain("encrypted_");
    expect(typesSource).toMatch(/Server-only credential storage/);
  });

  it("crypto module is server-only and uses dedicated env name", () => {
    expect(cryptoSource).toContain('import "server-only"');
    expect(cryptoSource).toContain("WHOOP_TOKEN_ENCRYPTION_KEY");
    expect(cryptoSource).not.toContain("console.log");
  });

  it("does not add OAuth/API/UI routes in F1 migration scope", () => {
    expect(readSource("lib/jarvis/life-areas/module-registry.ts")).toContain(
      'key: "fitness"',
    );
    expect(readSource("lib/jarvis/life-areas/module-registry.ts")).toContain(
      "implemented: false",
    );

    expect(migration).not.toContain("whoop_upsert_oauth_connection");
    expect(migration).not.toContain("whoop_claim_refresh");
  });

  it("SQL validation covers RLS, credentials isolation, and structure", () => {
    expect(validation).toContain("user A must SELECT own whoop_connections row");
    expect(validation).toContain(
      "user A must not SELECT user B whoop_connections row",
    );
    expect(validation).toContain(
      "authenticated must not INSERT whoop_connections",
    );
    expect(validation).toContain(
      "authenticated must not SELECT whoop_connection_credentials",
    );
    expect(validation).toContain("service_role must UPDATE whoop_connection_credentials");
    expect(validation).toContain("authenticated must not INSERT whoop_cycles");
    expect(validation).toContain(
      "authenticated must not SELECT whoop_webhook_events",
    );
    expect(validation).toContain("service_role must manage whoop_webhook_events");
    expect(validation).toContain(
      "whoop_connections must not contain token columns",
    );
    expect(validation).toContain(
      "nullable scoring fields must support pending WHOOP state",
    );
  });
});
