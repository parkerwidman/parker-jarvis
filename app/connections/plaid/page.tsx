import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import { PlaidDisconnectButton } from "@/components/connections/plaid-disconnect-button";
import { PlaidLinkButton } from "@/components/connections/plaid-link-button";
import { loadSafePlaidConnections } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
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
  const connectedInstitutionNames = connections
    .map((connection) => connection.institutionName)
    .filter((name): name is string => Boolean(name));

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Plaid — Personal Finance"
          subtitle="Connect Sandbox bank accounts for read-only transaction testing."
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
                Environment: {formatEnvironment("sandbox")}
              </p>

              <p className="jv-connection-meta">Purpose: read-only</p>

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Important</h3>
                <ul className="jv-capability-list">
                  <li>Sandbox uses fake financial data only.</li>
                  <li>This does not connect a real bank account.</li>
                  <li>Jarvis cannot transfer money or move funds.</li>
                  <li>Transaction importing comes in the next step.</li>
                </ul>
              </div>

              <PlaidLinkButton />
            </div>
          ) : (
            <div className="jv-connection-status">
              <p className="jv-connection-meta">
                Environment: {formatEnvironment(connections[0]?.environment ?? "sandbox")}
              </p>

              <p className="jv-connection-meta">Purpose: read-only</p>

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
                    Last synchronization:{" "}
                    {connection.lastSuccessfulSyncAt
                      ? formatConnectionDate(connection.lastSuccessfulSyncAt)
                      : "Not synced yet"}
                  </p>

                  {connection.reconnectRequired ? (
                    <p className="jv-connection-meta jv-connection-meta--error">
                      Reconnection required.
                    </p>
                  ) : null}

                  {connection.lastErrorCode && connection.status === "error" ? (
                    <p className="jv-connection-meta jv-connection-meta--error">
                      Connection error detected.
                    </p>
                  ) : null}

                  <PlaidDisconnectButton connectionId={connection.id} />
                </section>
              ))}

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Important</h3>
                <ul className="jv-capability-list">
                  <li>Sandbox uses fake financial data only.</li>
                  <li>This does not connect a real bank account.</li>
                  <li>Jarvis cannot transfer money or move funds.</li>
                  <li>Transaction importing comes in the next step.</li>
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
