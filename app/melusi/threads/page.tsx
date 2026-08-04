import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisField,
  JarvisPageContent,
  jarvisInputProps,
} from "@/components/jarvis/jarvis-ui";
import {
  findMelusiCommandThread,
  listMelusiThreads,
} from "@/lib/jarvis/agents/agent-thread-tools";
import { getThreadTypeLabel } from "@/lib/jarvis/agents/agent-registry";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  archiveMelusiThreadAction,
  createMelusiCampaignThread,
  createMelusiResearchThread,
} from "./actions";

function formatRelativeTime(isoString: string | null, timeZone: string): string {
  if (!isoString) {
    return "No messages yet";
  }

  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function threadTypeBadgeClass(threadType: string): string {
  switch (threadType) {
    case "command":
      return "melusi-thread-badge melusi-thread-badge--command";
    case "research":
      return "melusi-thread-badge melusi-thread-badge--research";
    case "campaign":
      return "melusi-thread-badge melusi-thread-badge--campaign";
    default:
      return "melusi-thread-badge";
  }
}

export default async function MelusiThreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; archived?: string }>;
}) {
  const { error, archived } = await searchParams;
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

  const [{ data: profileRow }, threads, commandThread] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle(),
    listMelusiThreads(supabase, userId, { status: "active", limit: 30 }),
    findMelusiCommandThread(supabase, userId),
  ]);

  const timeZone = profileRow?.timezone?.trim() || "America/Chicago";

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--melusi">
        <header className="melusi-header">
          <div className="melusi-header-copy">
            <Link href="/melusi" className="jv-back-link">
              ← Melusi Command Center
            </Link>
            <h1 className="melusi-title">Melusi Threads</h1>
            <p className="melusi-subtitle">
              Command, research, and campaign conversations with Melusi Jarvis.
            </p>
          </div>
        </header>

        <MelusiNav />

        {archived ? (
          <JarvisAlert variant="success">Thread archived.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        <section className="melusi-threads-grid">
          <JarvisCard title="Command conversation" accent="cyan">
            <p className="cc-empty">
              Your primary Melusi command thread opens from the command center
              or here when you send the first message.
            </p>
            {commandThread ? (
              <Link
                href={`/melusi/threads/${commandThread.id}`}
                className="cc-card-link"
              >
                Open command thread →
              </Link>
            ) : (
              <Link href="/melusi" className="cc-card-link">
                Open Melusi Command Center →
              </Link>
            )}
          </JarvisCard>

          <JarvisCard title="New research thread" accent="cyan">
            <p className="cc-empty">
              Focused advisory conversations. Live web research is not connected
              yet.
            </p>
            <form action={createMelusiResearchThread} className="jv-form">
              <JarvisField label="Thread name">
                <input
                  type="text"
                  name="title"
                  required
                  maxLength={200}
                  placeholder="e.g. B2B email positioning"
                  {...jarvisInputProps()}
                />
              </JarvisField>
              <JarvisButton type="submit" className="jv-btn--block">
                Create research thread
              </JarvisButton>
            </form>
          </JarvisCard>

          <JarvisCard title="New campaign thread" accent="cyan">
            <p className="cc-empty">
              Campaign planning conversations. Publishing tools are not connected
              yet.
            </p>
            <form action={createMelusiCampaignThread} className="jv-form">
              <JarvisField label="Thread name">
                <input
                  type="text"
                  name="title"
                  required
                  maxLength={200}
                  placeholder="e.g. Real estate launch"
                  {...jarvisInputProps()}
                />
              </JarvisField>
              <JarvisButton type="submit" className="jv-btn--block">
                Create campaign thread
              </JarvisButton>
            </form>
          </JarvisCard>
        </section>

        <section className="melusi-thread-list-section" aria-label="Recent threads">
          <h2 className="jv-section-label">Recent threads</h2>

          {threads.length > 0 ? (
            <ul className="melusi-thread-list">
              {threads.map((thread) => (
                <li key={thread.id} className="melusi-thread-item">
                  <div className="melusi-thread-main">
                    <div className="melusi-thread-heading">
                      <Link
                        href={`/melusi/threads/${thread.id}`}
                        className="melusi-thread-title"
                      >
                        {thread.title}
                      </Link>
                      <span className={threadTypeBadgeClass(thread.threadType)}>
                        {getThreadTypeLabel(thread.threadType)}
                      </span>
                    </div>
                    <p className="melusi-thread-meta">
                      Last activity:{" "}
                      {formatRelativeTime(thread.lastMessageAt, timeZone)}
                    </p>
                  </div>
                  {thread.threadType !== "command" ? (
                    <form action={archiveMelusiThreadAction}>
                      <input type="hidden" name="threadId" value={thread.id} />
                      <JarvisButton type="submit" variant="secondary">
                        Archive
                      </JarvisButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <JarvisEmptyState
              title="No threads yet"
              description="Send a message in the Melusi Command Center or create a research or campaign thread above."
            />
          )}
        </section>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
