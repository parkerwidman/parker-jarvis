"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { AssistantConversationHistory } from "@/components/jarvis/assistant-conversation-history";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import type { JarvisContextInitial } from "@/lib/jarvis/context/types";
import type { MainConversationSummary } from "@/lib/jarvis/conversations/types";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type MainAssistantWorkspaceProps = {
  userName: string;
  initialContext: JarvisContextInitial | null;
  initialConversations: MainConversationSummary[];
  selectedThreadId: string | null;
  initialMessages: ChatMessage[];
  initialHasOlderMessages: boolean;
};

function buildAssistantHref(threadId: string | null, context: JarvisContextInitial | null) {
  const params = new URLSearchParams();

  if (threadId) {
    params.set("thread", threadId);
  }

  if (context) {
    params.set("contextType", context.type);
    params.set("contextId", context.id);
  }

  const query = params.toString();

  return query.length > 0 ? `/assistant?${query}` : "/assistant";
}

export function MainAssistantWorkspace({
  userName,
  initialContext,
  initialConversations,
  selectedThreadId,
  initialMessages,
  initialHasOlderMessages,
}: MainAssistantWorkspaceProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const conversationKey = selectedThreadId ?? "new";

  const activeConversationTitle = useMemo(() => {
    if (!selectedThreadId) {
      return null;
    }

    return conversations.find((conversation) => conversation.id === selectedThreadId)
      ?.title;
  }, [conversations, selectedThreadId]);

  const handleNewChat = useCallback(() => {
    router.push(buildAssistantHref(null, initialContext));
  }, [initialContext, router]);

  const handleSelectConversation = useCallback(
    (threadId: string) => {
      router.push(buildAssistantHref(threadId, initialContext));
    },
    [initialContext, router],
  );

  const handleThreadIdChange = useCallback(
    (
      threadId: string,
      firstMessage: string,
      options?: { streaming?: boolean },
    ) => {
      const href = buildAssistantHref(threadId, initialContext);

      if (options?.streaming) {
        window.history.replaceState(window.history.state, "", href);
      } else {
        router.replace(href);
      }

      setConversations((current) => {
        const existing = current.find((conversation) => conversation.id === threadId);

        if (existing) {
          return current.map((conversation) =>
            conversation.id === threadId
              ? {
                  ...conversation,
                  lastMessageAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : conversation,
          );
        }

        return [
          {
            id: threadId,
            title: firstMessage.trim().slice(0, 70),
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...current,
        ];
      });
    },
    [initialContext, router],
  );

  return (
    <div className="assistant-workspace">
      <AssistantConversationHistory
        conversations={conversations}
        activeThreadId={selectedThreadId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />
      <div className="assistant-workspace-main">
        {activeConversationTitle ? (
          <p className="assistant-workspace-active-title">{activeConversationTitle}</p>
        ) : null}
        <JarvisChat
          key={conversationKey}
          variant="fullPage"
          userName={userName}
          agentKey="main"
          threadId={selectedThreadId}
          initialMessages={initialMessages}
          hasOlderMessages={initialHasOlderMessages}
          richAssistantResponses
          messagesApiPath={
            selectedThreadId
              ? `/api/assistant/threads/${selectedThreadId}/messages`
              : undefined
          }
          onThreadIdChange={handleThreadIdChange}
        />
      </div>
    </div>
  );
}
