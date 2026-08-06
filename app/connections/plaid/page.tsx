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
import { loadPlaidTransactionMatchReviewPendingCount } from "@/lib/jarvis/integrations/plaid/load-plaid-transaction-match-review";
import { getCurrentPlaidRuntimeEnvironment } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import type {
  PlaidEnvironment,
  PlaidSafeConnectionSummary,
} from "@/lib/jarvis/integrations/plaid/plaid-types";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

function isSandboxEnvironment(environment: PlaidEnvironment): boolean {
  return environment === "sandbox";
}

function getPageSubtitle(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Connect Sandbox bank accounts and manually sync fake read-only balances and transactions."
    : "Connect financial institutions and manually sync read-only balances and transactions.";
}

function getConnectButtonLabel(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Connect Sandbox bank"
    : "Connect financial institution";
}

function getConnectAnotherLabel(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Connect another Sandbox bank"
    : "Connect another financial institution";
}

function getImportantNotices(environment: PlaidEnvironment): string[] {
  if (isSandboxEnvironment(environment)) {
    return [
      "Sandbox uses fake financial data only.",
      "This does not connect a real bank account.",
      "Jarvis cannot transfer money or move funds.",
      "Balances shown are cached provider balances.",
      "Automatic read-only syncing runs once daily; exact timing may vary within the scheduled hour.",
      "You can still sync manually at any time with Sync now.",
    ];
  }

  return [
    "This connects a real financial institution through Plaid.",
    "Jarvis receives read-only account and transaction data.",
    "Jarvis cannot transfer money or move funds.",
    "Balances are cached provider balances.",
    "Automatic read-only syncing runs once daily; exact timing may vary within the scheduled hour.",
    "You can still sync manually at any time with Sync now.",
    "Real-time webhooks are not enabled.",
  ];
}

function getConnectionAriaLabel(
  environment: PlaidEnvironment,
  institutionName?: string | null,
): string {
  if (institutionName) {
    return `${institutionName} connection`;
  }

  return isSandboxEnvironment(environment)
    ? "Sandbox bank connection"
    : "Financial institution connection";
}

function getTokenNotRepairableMessage(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "This Sandbox bank connection can no longer be renewed through Plaid update mode. Imported Finance data is preserved."
    : "This financial institution connection can no longer be renewed through Plaid update mode. Imported Finance data is preserved.";
}

function getConnectErrorMessage(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Could not connect the Sandbox bank. Please try again."
    : "Could not connect the financial institution. Please try again.";
}

function getAdditionalConnectionHint(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Link another institution only if you intend to add a separate Sandbox bank login."
    : "Link another institution only if you intend to add a separate financial institution login.";
}

function getDisconnectErrorMessage(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Could not disconnect this Sandbox bank."
    : "Could not disconnect this financial institution.";
}

function getSyncAllLabel(environment: PlaidEnvironment): string {
  return isSandboxEnvironment(environment)
    ? "Sync all Sandbox banks"
    : "Sync all financial institutions";
}

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

  const [connections, pendingPlaidReviewCount] = await Promise.all([
    loadSafePlaidConnections(supabase, userId),
    loadPlaidTransactionMatchReviewPendingCount(supabase, userId),
  ]);
  const runtimeEnvironment = getCurrentPlaidRuntimeEnvironment();
  const pageSubtitle = getPageSubtitle(runtimeEnvironment);
  const connectButtonLabel = getConnectButtonLabel(runtimeEnvironment);
  const connectAnotherLabel = getConnectAnotherLabel(runtimeEnvironment);
  const importantNotices = getImportantNotices(runtimeEnvironment);
  const connectErrorMessage = getConnectErrorMessage(runtimeEnvironment);
  const additionalConnectionHint = getAdditionalConnectionHint(runtimeEnvironment);
  const disconnectErrorMessage = getDisconnectErrorMessage(runtimeEnvironment);
  const syncAllLabel = getSyncAllLabel(runtimeEnvironment);
  const tokenNotRepairableMessage = getTokenNotRepairableMessage(runtimeEnvironment);
  const connectedInstitutionNames = connections
    .map((connection) => connection.institutionName)
    .filter((name): name is string => Boolean(name));
  const syncableConnections = connections.filter((connection) => connection.connected);

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Plaid — Personal Finance"
          subtitle={pageSubtitle}
          meta={
            <Link href="/finance/plaid-review" className="finance-dash-manage-link">
              Review transaction matches
              {pendingPlaidReviewCount > 0 ? (
                <span className="jv-section-count">{pendingPlaidReviewCount}</span>
              ) : null}
            </Link>
          }
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
                  {importantNotices.map((notice) => (
                    <li key={notice}>{notice}</li>
                  ))}
                </ul>
              </div>

              <PlaidLinkButton
                label={connectButtonLabel}
                connectErrorMessage={connectErrorMessage}
                additionalConnectionHint={additionalConnectionHint}
              />
            </div>
          ) : (
            <div className="jv-connection-status">
              <p className="jv-connection-meta">
                Environment: {formatEnvironment(runtimeEnvironment)}
              </p>

              <p className="jv-connection-meta">Purpose: read-only</p>
              <p className="jv-connection-meta">
                Balances are cached provider balances. Automatic read-only syncing runs once
                daily; exact timing may vary within the scheduled hour. Use Sync now for an
                immediate update.
              </p>

              {connections.map((connection) => (
                <section
                  key={connection.id}
                  className="jv-connection-status"
                  aria-label={getConnectionAriaLabel(
                    runtimeEnvironment,
                    connection.institutionName,
                  )}
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
                      {tokenNotRepairableMessage}
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

                  <PlaidDisconnectButton
                    connectionId={connection.id}
                    disconnectErrorMessage={disconnectErrorMessage}
                  />
                </section>
              ))}

              {syncableConnections.length > 1 ? (
                <PlaidSyncButton
                  syncAll
                  label={syncAllLabel}
                  disabled={syncableConnections.some((c) => c.syncInProgress)}
                />
              ) : null}

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Important</h3>
                <ul className="jv-capability-list">
                  {importantNotices.map((notice) => (
                    <li key={notice}>{notice}</li>
                  ))}
                </ul>
              </div>

              <PlaidLinkButton
                label={connectAnotherLabel}
                connectErrorMessage={connectErrorMessage}
                additionalConnectionHint={additionalConnectionHint}
                connectedInstitutionNames={connectedInstitutionNames}
              />
            </div>
          )}
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
