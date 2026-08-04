import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { JarvisContextProvider } from "@/components/jarvis/context/jarvis-context-provider";
import { getThreadTypeLabel } from "@/lib/jarvis/agents/agent-registry";
import { loadAgentThreadWithMessages, toChatInitialMessages } from "@/lib/jarvis/agents/load-agent-thread";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

function threadNotice(threadType: string): string | null {
  switch (threadType) {
    case "research":
      return "Live web research tools are not connected yet. This thread is a persistent focused advisory conversation.";
    case "campaign":
      return "Campaign publishing and social scheduling are not connected yet. This thread helps plan and advise using stored Melusi data.";
    default:
      return null;
  }
}

export default async function MelusiThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
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

  const thread = await loadAgentThreadWithMessages(
    supabase,
    userId,
    threadId,
  );

  if (!thread) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("jarvis_profiles")
    .select("preferred_name")
    .eq("user_id", userId)
    .maybeSingle();

  const displayName = profile?.preferred_name?.trim() || "Parker";
  const notice = threadNotice(thread.threadType);
  const initialMessages = toChatInitialMessages(thread.messages);

  return (
    <JarvisAppShell mainClassName="app-main--assistant">
      <JarvisPageContent className="jv-page-content--assistant">
        <Link href="/melusi/threads" className="jv-back-link jv-back-link--assistant">
          ← Melusi Threads
        </Link>
        <MelusiNav />
        <div className="melusi-thread-page-meta">
          <span className="melusi-thread-badge melusi-thread-badge--page">
            {getThreadTypeLabel(thread.threadType)}
          </span>
          <h1 className="melusi-thread-page-title">{thread.title}</h1>
          {notice ? <p className="melusi-thread-notice">{notice}</p> : null}
        </div>
        <JarvisContextProvider>
          <JarvisChat
            variant="fullPage"
            userName={displayName}
            agentKey="melusi"
            threadId={thread.id}
            initialMessages={initialMessages}
            agentDisplayName="Melusi Jarvis"
            agentSubtitle={`${getThreadTypeLabel(thread.threadType)} thread`}
            welcomeHint="Melusi Jarvis uses your stored projects, tasks, and updates. Integrations not connected yet are never fabricated."
          />
        </JarvisContextProvider>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
