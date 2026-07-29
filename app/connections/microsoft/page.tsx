import Link from "next/link";
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

export default async function MicrosoftConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

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

  const { data: connection } = await supabase
    .from("microsoft_connections")
    .select("microsoft_user_id, email, display_name, connected_at")
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Microsoft 365</h1>
          <p className="home-subtitle">
            Connect Jarvis to Melusi Outlook and Calendar.
          </p>
        </header>

        {connected === "true" ? (
          <p className="w-full rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] px-5 py-3 text-center text-sm text-green-400">
            Microsoft 365 connected successfully.
          </p>
        ) : null}

        {error ? (
          <p className="w-full rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-5 py-3 text-center text-sm text-red-400">
            Could not connect Microsoft 365. Please try again.
          </p>
        ) : null}

        <section className="flex w-full flex-col gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-7">
          {connection ? (
            <>
              <div className="flex items-center gap-2">
                <span className="home-status-dot" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Connected
                </span>
              </div>

              {connection.display_name ? (
                <p className="text-sm text-[var(--foreground)]">
                  {connection.display_name}
                </p>
              ) : null}

              {connection.email ? (
                <p className="text-sm text-[var(--navy-muted)]">
                  {connection.email}
                </p>
              ) : null}

              {connection.connected_at ? (
                <p className="text-xs text-[var(--navy-muted)]">
                  Connected on {formatConnectionDate(connection.connected_at)}
                </p>
              ) : null}
            </>
          ) : (
            <Link
              href="/api/microsoft/connect"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 no-underline"
            >
              Connect Microsoft 365
            </Link>
          )}
        </section>

        <Link
          href="/"
          className="text-sm font-medium text-[var(--navy-muted)] transition-colors hover:text-[var(--foreground)]"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
