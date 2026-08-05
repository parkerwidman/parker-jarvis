import type { JarvisContext } from "@/lib/jarvis/tools/memory-tools";
import { MELUSI_JARVIS_INSTRUCTIONS } from "./agent-registry";
import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "./main-instructions-content";
import type { AgentKey, MelusiThreadType } from "./types";

function buildPersonalContextSection(context: JarvisContext): string {
  const sections: string[] = [];

  if (context.profile) {
    const profileParts: string[] = [];

    if (context.profile.preferred_name) {
      profileParts.push(`Preferred name: ${context.profile.preferred_name}`);
    }
    if (context.profile.timezone) {
      profileParts.push(`Timezone: ${context.profile.timezone}`);
    }
    if (context.profile.communication_style) {
      profileParts.push(
        `Communication style: ${context.profile.communication_style}`,
      );
    }
    if (context.profile.current_focus) {
      profileParts.push(`Current focus: ${context.profile.current_focus}`);
    }

    if (profileParts.length > 0) {
      sections.push(`Profile:\n${profileParts.join("\n")}`);
    }
  }

  if (context.lifeAreas.length > 0) {
    const names = context.lifeAreas.map((area) => area.name).join(", ");
    sections.push(`Life areas: ${names}`);
  }

  if (context.goals.length > 0) {
    const goalLines = context.goals.map((goal) => {
      const parts = [`- ${goal.title} (${goal.status}, ${goal.priority} priority)`];

      if (goal.description) {
        parts.push(`  Description: ${goal.description}`);
      }
      if (goal.success_definition) {
        parts.push(`  Success: ${goal.success_definition}`);
      }
      if (goal.target_date) {
        parts.push(`  Target date: ${goal.target_date}`);
      }
      if (goal.progress > 0) {
        parts.push(`  Progress: ${goal.progress}%`);
      }

      const lifeArea = context.lifeAreas.find(
        (area) => area.id === goal.life_area_id,
      );
      if (lifeArea) {
        parts.push(`  Life area: ${lifeArea.name}`);
      }

      return parts.join("\n");
    });

    sections.push(`Goals:\n${goalLines.join("\n")}`);
  }

  if (context.memories.length > 0) {
    const memoryLines = context.memories.map(
      (memory) =>
        `- [${memory.category}, importance ${memory.importance}] ${memory.content}`,
    );
    sections.push(`Memories:\n${memoryLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\nPersonal context (saved information about Parker):\n${sections.join("\n\n")}`;
}

function buildDateTimeSection(context: JarvisContext): string {
  const timeZone = context.profile?.timezone ?? "America/Chicago";
  const now = new Date();
  const utcNow = now.toISOString();
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return `\n\nCurrent date and time:\nUTC: ${utcNow}\nLocal (${timeZone}): ${localNow}`;
}

function buildMelusiThreadSection(threadType: MelusiThreadType): string {
  switch (threadType) {
    case "command":
      return "\n\nThread context: This is Parker's primary Melusi command conversation.";
    case "research":
      return "\n\nThread context: This is a focused research advisory thread. Live web research tools are not connected yet. Do not claim to have searched the web or verified external facts.";
    case "campaign":
      return "\n\nThread context: This is a campaign planning thread. Social scheduling and publishing through Jarvis are not enabled yet. You may use get_melusi_social_performance for read-only Metricool analytics and help plan campaigns using available project, task, and social data.";
  }
}

export function buildAgentInstructions(
  agentKey: AgentKey,
  context: JarvisContext,
  selectedRecordSection = "",
  melusiThreadType?: MelusiThreadType,
): string {
  const baseInstructions =
    agentKey === "melusi"
      ? MELUSI_JARVIS_INSTRUCTIONS
      : BASE_MAIN_JARVIS_INSTRUCTIONS;

  const threadSection =
    agentKey === "melusi" && melusiThreadType
      ? buildMelusiThreadSection(melusiThreadType)
      : "";

  return (
    baseInstructions +
    buildDateTimeSection(context) +
    buildPersonalContextSection(context) +
    threadSection +
    selectedRecordSection
  );
}
