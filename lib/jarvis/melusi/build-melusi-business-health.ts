import type {
  MelusiAttentionItem,
  MelusiBusinessPriority,
} from "@/lib/jarvis/melusi/build-melusi-command-center-view";

export type MelusiBusinessHealthState =
  | "optimal"
  | "needs_attention"
  | "limited";

export type MelusiBusinessHealth = {
  state: MelusiBusinessHealthState;
  headline: string;
  summary: string;
};

function hasUrgentOrWarningAttention(
  attentionItems: MelusiAttentionItem[],
): boolean {
  return attentionItems.some(
    (item) => item.severity === "urgent" || item.severity === "warning",
  );
}

export function buildMelusiBusinessHealth(input: {
  attentionItems: MelusiAttentionItem[];
  businessPriority: MelusiBusinessPriority;
  activeProjectCount: number;
  openTaskCount: number;
  socialStatus: string;
  socialConnected: boolean;
}): MelusiBusinessHealth {
  const hasActivity =
    input.activeProjectCount > 0 || input.openTaskCount > 0;

  if (!hasActivity) {
    return {
      state: "limited",
      headline: "Limited Activity",
      summary: "No active Melusi projects or open tasks yet.",
    };
  }

  const priorityOverdue =
    input.businessPriority?.kind === "task" && input.businessPriority.overdue;

  const socialNeedsAttention =
    input.socialStatus === "reconnect_required" ||
    (!input.socialConnected && input.socialStatus === "disconnected");

  const needsAttention =
    hasUrgentOrWarningAttention(input.attentionItems) ||
    priorityOverdue ||
    input.socialStatus === "reconnect_required";

  if (needsAttention) {
    let summary = "Review the items flagged in Needs Attention.";

    if (priorityOverdue) {
      summary = "Your top priority task is overdue.";
    } else if (input.socialStatus === "reconnect_required") {
      summary = "Social connection needs to be renewed.";
    } else if (hasUrgentOrWarningAttention(input.attentionItems)) {
      summary = "One or more business issues need your attention.";
    }

    return {
      state: "needs_attention",
      headline: "Needs Attention",
      summary,
    };
  }

  if (socialNeedsAttention && input.socialConnected === false) {
    return {
      state: "optimal",
      headline: "All Systems Optimal",
      summary:
        "Core business operations look clear. Social analytics are not connected yet.",
    };
  }

  return {
    state: "optimal",
    headline: "All Systems Optimal",
    summary: "Everything is running smoothly.",
  };
}
