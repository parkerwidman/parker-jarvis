import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MainAssistantWorkspace } from "@/components/jarvis/main-assistant-workspace";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { JarvisContextProvider } from "@/components/jarvis/context/jarvis-context-provider";
import { toChatInitialMessages } from "@/lib/jarvis/agents/load-agent-thread";
import { isValidThreadId } from "@/lib/jarvis/agents/types";
import { loadAssistantContext } from "@/lib/jarvis/context/load-assistant-context";
import { parseJarvisContextTarget } from "@/lib/jarvis/context/types";
import type { JarvisContextInitial } from "@/lib/jarvis/context/types";
import {
  listMainConversations,
  loadAuthorizedMainThread,
  loadMainThreadMessagesPage,
} from "@/lib/jarvis/conversations/main-conversation-tools";
import { createClient } from "@/lib/supabase/server";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{
    contextType?: string;
    contextId?: string;
    thread?: string;
  }>;
}) {
  const { contextType, contextId, thread } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  let displayName = "Parker";
  let initialContext: JarvisContextInitial | null = null;
  let selectedThreadId: string | null = null;
  let initialMessages: ReturnType<typeof toChatInitialMessages> = [];
  let initialHasOlderMessages = false;

  const { data: profile } = await supabase
    .from("jarvis_profiles")
    .select("preferred_name")
    .eq("user_id", userId)
    .maybeSingle();

  displayName = profile?.preferred_name?.trim() || "Parker";

  const parsedTarget = parseJarvisContextTarget(contextType, contextId);

  if (parsedTarget) {
    const loaded = await loadAssistantContext(
      supabase,
      userId,
      parsedTarget,
    );

    if (loaded.success) {
      initialContext = {
        type: loaded.context.type,
        id: loaded.context.id,
        displayLabel: loaded.displayLabel,
      };
    }
  }

  if (thread) {
    if (!isValidThreadId(thread)) {
      notFound();
    }

    selectedThreadId = thread;
  }

  const [conversations, selectedThread, selectedMessagesPage] = await Promise.all([
    listMainConversations(supabase, userId),
    selectedThreadId
      ? loadAuthorizedMainThread(supabase, userId, selectedThreadId)
      : Promise.resolve(null),
    selectedThreadId
      ? loadMainThreadMessagesPage(supabase, userId, selectedThreadId)
      : Promise.resolve({ messages: [], hasOlder: false }),
  ]);

  if (selectedThreadId && !selectedThread) {
    notFound();
  }

  if (selectedThread) {
    initialMessages = selectedMessagesPage.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));
    initialHasOlderMessages = selectedMessagesPage.hasOlder;
  }

  return (
    <JarvisAppShell mainClassName="app-main--assistant">
      <JarvisPageContent className="jv-page-content--assistant jv-page-content--assistant-history">
        <Link href="/" className="jv-back-link jv-back-link--assistant">
          ← Command Center
        </Link>
        <JarvisContextProvider initialContext={initialContext}>
          <MainAssistantWorkspace
            userName={displayName}
            initialContext={initialContext}
            initialConversations={conversations}
            selectedThreadId={selectedThreadId}
            initialMessages={initialMessages}
            initialHasOlderMessages={initialHasOlderMessages}
          />
        </JarvisContextProvider>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
