import { PlaidDisconnectButton } from "@/components/connections/plaid-disconnect-button";
import { PlaidLinkButton } from "@/components/connections/plaid-link-button";
import { PlaidReconnectButton } from "@/components/connections/plaid-reconnect-button";
import { PlaidSyncButton } from "@/components/connections/plaid-sync-button";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import { loadSafePlaidConnections } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { getCurrentPlaidRuntimeEnvironment } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function formatConnectionDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatEnvironment(environment: string): string {
  return environment === "sandbox" ? "Sandbox" : "Production";
}

function formatConnectionStatus(connection: PlaidSafeConnectionSummary): string {
  if (connection.syncInProgress) {
    return "Sync in progress";
  }

  if (connection.connected) {
    return "Connected";
  }

  if (connection.reconnectRequired) {
    return "Reconnection required";
  }

  if (connection.status === "error") {
    return "Error";
  }

  return "Not connected";
}

function formatSyncStatus(connection: PlaidSafeConnectionSummary): string {
  if (connection.syncInProgress) {
    return "Syncing";
  }

  if (connection.reconnectRequired) {
    return "Reconnect required";
  }

  if (connection.lastSuccessfulSyncAt) {
    return "Last sync succeeded";
  }

  if (connection.lastErrorCode) {
    return "Last sync failed";
  }

  return "Not synced yet";
}

export default async function PlaidConnectionPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const userId =
    typeof authData.claims.sub === "string" ? authData.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const connections = await loadSafePlaidConnections(supabase, userId);
  const runtimeEnvironment = getCurrentPlaidRuntimeEnvironment();
  const connectedInstitutionNames = connections
    .map((connection) => connection.institutionName)
    .filter((name): name is string => Boolean(name));
  const syncableConnections = connections.filter((connection) => connection.connected);

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Plaid — Personal Finance"
          subtitle="Connect Sandbox bank accounts and manually sync read-only balances and transactions."
        />

        <JarvisCard title="Connection status" accent="green">
          {connections.length === 0 ? (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span
                  className="jv-status-dot jv-status-dot--offline"
                  aria-hidden="true"
                />
                <span className="jv-connection-label">Not connected</span>
              </div>

              <p className="jv-connection-meta">
                Environment: {formatEnvironment(runtimeEnvironment)}
              </p>

              <p className="jv-connection-meta">Purpose: read-only</p>

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Important</h3>
                <ul className="jv-capability-list">
                  <li>Sandbox uses fake financial data only.</li>
                  <li>This does not connect a real bank account.</li>
                  <li>Jarvis cannot transfer money or move funds.</li>
                  <li>Balances shown are cached provider balances.</li>
                  <li>Automatic updates are not enabled yet.</li>
                </ul>
              </div>

              <PlaidLinkButton />
            </div>
          ) : (
            <div className="jv-connection-status">
              <p className="jv-connection-meta">
                Environment: {formatEnvironment(runtimeEnvironment)}
              </p>

              <p className="jv-connection-meta">Purpose: read-only</p>
              <p className="jv-connection-meta">
                Balances are cached provider balances. Automatic updates are not enabled yet.
              </p>

              {connections.map((connection) => (
                <section
                  key={connection.id}
                  className="jv-connection-status"
                  aria-label={
                    connection.institutionName
                      ? `${connection.institutionName} connection`
                      : "Sandbox bank connection"
                  }
                >
                  <div className="jv-connection-indicator">
                    <span
                      className={`jv-status-dot${connection.connected ? "" : " jv-status-dot--offline"}`}
                      aria-hidden="true"
                    />
                    <span className="jv-connection-label">
                      {formatConnectionStatus(connection)}
                    </span>
                  </div>

                  {connection.institutionName ? (
                    <p className="jv-connection-name">{connection.institutionName}</p>
                  ) : null}

                  {connection.connectedAt ? (
                    <p className="jv-connection-meta">
                      Connected on {formatConnectionDate(connection.connectedAt)}
                    </p>
                  ) : null}

                  <p className="jv-connection-meta">
                    Sync status: {formatSyncStatus(connection)}
                  </p>

                  <p className="jv-connection-meta">
                    Last successful sync:{" "}
                    {connection.lastSuccessfulSyncAt
                      ? formatConnectionDate(connection.lastSuccessfulSyncAt)
                      : "Not synced yet"}
                  </p>

                  {connection.linkedAccountsCount !== null ? (
                    <p className="jv-connection-meta">
                      Linked accounts: {connection.linkedAccountsCount}
                    </p>
                  ) : null}

                  {connection.lastSuccessfulSyncAt ? (
                    <p className="jv-connection-meta">
                      Last sync totals: accounts created {connection.lastSyncAccountsCreated ?? 0},
                      updated {connection.lastSyncAccountsUpdated ?? 0}; transactions added{" "}
                      {connection.lastSyncTransactionsAdded ?? 0}, modified{" "}
                      {connection.lastSyncTransactionsModified ?? 0}, removed{" "}
                      {connection.lastSyncTransactionsRemoved ?? 0}; unclassified{" "}
                      {connection.lastSyncUnclassifiedCount ?? 0}
                    </p>
                  ) : null}

                  {connection.reconnectRequired ? (
                    <>
                      <p className="jv-connection-meta jv-connection-meta--error">
                        Plaid needs you to renew this bank connection before syncing.
                      </p>
                      <PlaidReconnectButton
                        connectionId={connection.id}
                        disabled={connection.syncInProgress}
                      />
                    </>
                  ) : null}

                  {connection.lastErrorCode === "token_not_repairable" ? (
                    <p className="jv-connection-meta jv-connection-meta--error">
                      This Sandbox bank connection can no longer be renewed through Plaid
                      update mode. Imported Finance data is preserved.
                    </p>
                  ) : null}

                  {connection.lastErrorCode && connection.status === "error" ? (
                    <p className="jv-connection-meta jv-connection-meta--error">
                      Connection error detected.
                    </p>
                  ) : null}

                  <PlaidSyncButton
                    connectionId={connection.id}
                    disabled={
                      !connection.connected ||
                      connection.reconnectRequired ||
                      connection.syncInProgress
                    }
                  />

                  <PlaidDisconnectButton connectionId={connection.id} />
                </section>
              ))}

              {syncableConnections.length > 1 ? (
                <PlaidSyncButton syncAll disabled={syncableConnections.some((c) => c.syncInProgress)} />
              ) : null}

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Important</h3>
                <ul className="jv-capability-list">
                  <li>Sandbox uses fake financial data only.</li>
                  <li>This does not connect a real bank account.</li>
                  <li>Jarvis cannot transfer money or move funds.</li>
                  <li>Balances shown are cached provider balances.</li>
                  <li>Automatic updates are not enabled yet.</li>
                </ul>
              </div>

              <PlaidLinkButton
                label="Connect another Sandbox bank"
                connectedInstitutionNames={connectedInstitutionNames}
              />
            </div>
          )}
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
