"use client";

import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import type { MelusiQuickAction } from "@/lib/jarvis/melusi/product-config";
import { MELUSI_QUICK_ACTIONS } from "@/lib/jarvis/melusi/product-config";

type MelusiJarvisPanelProps = {
  userName: string;
  threadId: string | null;
  initialMessages: Array<{ role: "user" | "assistant"; content: string }>;
  expandHref: string;
  socialConnected?: boolean;
};

export function MelusiJarvisPanel({
  userName,
  threadId,
  initialMessages,
  expandHref,
  socialConnected = false,
}: MelusiJarvisPanelProps) {
  const quickActions: MelusiQuickAction[] = MELUSI_QUICK_ACTIONS;

  return (
    <JarvisChat
      variant="embedded"
      userName={userName}
      agentKey="melusi"
      threadId={threadId}
      initialMessages={initialMessages}
      agentDisplayName="Melusi Jarvis"
      agentSubtitle="Melusi business advisor"
      expandHref={expandHref}
      welcomeHint="Ask about Melusi projects, strategy, content, and priorities."
      promptChips={quickActions.map((action) => ({
        label: action.label,
        prompt: action.prompt,
        unavailableMessage: action.setupMessage,
        requiresSetup:
          action.requiresIntegration === "social"
            ? !socialConnected
            : action.requiresIntegration !== null,
      }))}
    />
  );
}
