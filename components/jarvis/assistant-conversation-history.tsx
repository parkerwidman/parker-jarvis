"use client";

import type { MainConversationSummary } from "@/lib/jarvis/conversations/types";

type AssistantConversationHistoryProps = {
  conversations: MainConversationSummary[];
  activeThreadId: string | null;
  onSelectConversation: (threadId: string) => void;
  onNewChat: () => void;
};

export function AssistantConversationHistory({
  conversations,
  activeThreadId,
  onSelectConversation,
  onNewChat,
}: AssistantConversationHistoryProps) {
  return (
    <aside
      className="assistant-conversation-history"
      aria-label="Previous conversations"
    >
      <div className="assistant-conversation-history-header">
        <h2 className="assistant-conversation-history-title">Chats</h2>
        <button
          type="button"
          className="assistant-conversation-new"
          onClick={onNewChat}
        >
          + New Chat
        </button>
      </div>
      <div className="assistant-conversation-history-list">
        {conversations.length === 0 ? (
          <p className="assistant-conversation-history-empty">
            No previous conversations yet.
          </p>
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === activeThreadId;

            return (
              <button
                key={conversation.id}
                type="button"
                className={`assistant-conversation-item${isActive ? " assistant-conversation-item--active" : ""}`}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <span className="assistant-conversation-item-title">
                  {conversation.title}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
