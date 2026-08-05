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
  variant?: "embedded" | "compact";
  compactStatusLine?: string;
};

export function MelusiJarvisPanel({
  userName,
  threadId,
  initialMessages,
  expandHref,
  socialConnected = false,
  variant = "embedded",
  compactStatusLine,
}: MelusiJarvisPanelProps) {
  const quickActions: MelusiQuickAction[] = MELUSI_QUICK_ACTIONS;

  return (
    <JarvisChat
      variant={variant}
      userName={userName}
      agentKey="melusi"
      threadId={threadId}
      initialMessages={initialMessages}
      agentDisplayName="Melusi Jarvis"
      agentSubtitle="Melusi business advisor"
      expandHref={expandHref}
      compactStatusLine={compactStatusLine}
      deferCompactHistory={variant === "compact"}
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
