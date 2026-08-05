import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import {
  JarvisAlert,
  JarvisButton,
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

  return new Date(isoString).toLocaleString("en-US", {
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
      <JarvisPageContent className="jv-page-content--melusi-command melusi-workspace">
        <header className="melusi-dash-header melusi-subpage-header">
          <div className="melusi-dash-header-main">
            <h1 className="melusi-dash-title">
              Melusi <span>Threads</span>
            </h1>
            <p className="melusi-dash-descriptor">
              Command, research, and campaign conversations
            </p>
          </div>
        </header>

        <MelusiNav />

        {archived ? (
          <JarvisAlert variant="success">Thread archived.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        <section className="melusi-threads-actions" aria-label="Thread actions">
          <Link
            href={
              commandThread
                ? `/melusi/threads/${commandThread.id}`
                : "/melusi"
            }
            className="melusi-thread-action melusi-thread-action--primary"
          >
            <span className="melusi-thread-action-label">Command conversation</span>
            <span className="melusi-thread-action-meta">
              {commandThread ? "Open primary thread" : "Start from overview"}
            </span>
          </Link>

          <details className="melusi-thread-action-details">
            <summary className="melusi-thread-action">
              <span className="melusi-thread-action-label">New research thread</span>
              <span className="melusi-thread-action-meta">Focused advisory chat</span>
            </summary>
            <form action={createMelusiResearchThread} className="melusi-thread-create-form">
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
          </details>

          <details className="melusi-thread-action-details">
            <summary className="melusi-thread-action">
              <span className="melusi-thread-action-label">New campaign thread</span>
              <span className="melusi-thread-action-meta">Campaign planning chat</span>
            </summary>
            <form action={createMelusiCampaignThread} className="melusi-thread-create-form">
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
          </details>
        </section>

        <section className="melusi-thread-list-section" aria-label="Recent threads">
          <h2 className="melusi-section-title">Recent threads</h2>

          {threads.length > 0 ? (
            <ul className="melusi-thread-list melusi-thread-list--compact">
              {threads.map((thread) => (
                <li key={thread.id} className="melusi-thread-item melusi-thread-item--compact">
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
                      {formatRelativeTime(thread.lastMessageAt, timeZone)}
                    </p>
                  </div>
                  {thread.threadType !== "command" ? (
                    <form action={archiveMelusiThreadAction}>
                      <input type="hidden" name="threadId" value={thread.id} />
                      <JarvisButton type="submit" variant="secondary" className="melusi-thread-archive">
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
              description="Open the command conversation or create a research or campaign thread above."
            />
          )}
        </section>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
