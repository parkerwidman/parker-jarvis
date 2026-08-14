import type OpenAI from "openai";

import { MAIN_JARVIS_TOOLS } from "@/lib/jarvis/agents/tool-definitions";
import { classifyToolExecutionSafety } from "@/lib/jarvis/agents/tool-execution-safety";
import { estimateTokens } from "@/lib/jarvis/context-engine/context-budget";

export const MAIN_TOOL_DOMAIN_ORDER = [
  "tasks",
  "projects",
  "memory",
  "outlook_inbox",
  "outlook_calendar",
  "outlook_writes",
  "personal_finance",
  "melusi_expenses",
  "schedule_read",
  "schedule_write",
] as const;

export type MainToolDomain = (typeof MAIN_TOOL_DOMAIN_ORDER)[number];

export type MainToolDomainRecord = {
  name: string;
  domain: MainToolDomain;
  safety: "read" | "write";
  sideEffects: boolean;
  requiresExplicitRequest: boolean;
  mayBeNeededImplicitly: boolean;
  relatedTools: string[];
};

const TOOL_DOMAIN_MAP: Record<string, MainToolDomain> = {
  list_tasks: "tasks",
  create_task: "tasks",
  complete_task: "tasks",
  list_projects: "projects",
  create_project: "projects",
  update_project_status: "projects",
  create_project_update: "projects",
  list_project_updates: "projects",
  update_jarvis_profile: "memory",
  save_memory: "memory",
  create_goal: "memory",
  list_outlook_inbox: "outlook_inbox",
  create_outlook_draft: "outlook_inbox",
  send_outlook_email: "outlook_inbox",
  list_outlook_calendar: "outlook_calendar",
  create_outlook_reminder: "outlook_calendar",
  create_outlook_calendar_event: "outlook_calendar",
  get_personal_finance_summary: "personal_finance",
  get_personal_spending: "personal_finance",
  get_personal_recurring_charges: "personal_finance",
  get_melusi_expenses: "melusi_expenses",
  get_schedule_for_date: "schedule_read",
  get_schedule_for_week: "schedule_read",
  get_schedule_periods: "schedule_read",
  find_schedule_open_windows: "schedule_read",
  propose_add_schedule_item: "schedule_write",
  propose_update_schedule_item: "schedule_write",
  propose_move_schedule_item: "schedule_write",
  propose_remove_schedule_item: "schedule_write",
  propose_skip_schedule_occurrence: "schedule_write",
  confirm_pending_schedule_action: "schedule_write",
  cancel_pending_schedule_action: "schedule_write",
};

const DOMAIN_TOOL_ORDER: Record<MainToolDomain, readonly string[]> = {
  tasks: ["list_tasks", "create_task", "complete_task"],
  projects: [
    "list_projects",
    "create_project",
    "update_project_status",
    "create_project_update",
    "list_project_updates",
  ],
  memory: ["update_jarvis_profile", "save_memory", "create_goal"],
  outlook_inbox: [
    "list_outlook_inbox",
    "create_outlook_draft",
    "send_outlook_email",
  ],
  outlook_calendar: [
    "list_outlook_calendar",
    "create_outlook_reminder",
    "create_outlook_calendar_event",
  ],
  outlook_writes: [],
  personal_finance: [
    "get_personal_finance_summary",
    "get_personal_spending",
    "get_personal_recurring_charges",
  ],
  melusi_expenses: ["get_melusi_expenses"],
  schedule_read: [
    "get_schedule_for_date",
    "get_schedule_for_week",
    "get_schedule_periods",
    "find_schedule_open_windows",
  ],
  schedule_write: [
    "propose_add_schedule_item",
    "propose_update_schedule_item",
    "propose_move_schedule_item",
    "propose_remove_schedule_item",
    "propose_skip_schedule_occurrence",
    "confirm_pending_schedule_action",
    "cancel_pending_schedule_action",
  ],
};

const MAIN_TOOL_BY_NAME = new Map(
  MAIN_JARVIS_TOOLS.flatMap((tool) =>
    tool.type === "function" && tool.name
      ? [[tool.name, tool] as const]
      : [],
  ),
);

export function getMainToolDomain(toolName: string): MainToolDomain | null {
  return TOOL_DOMAIN_MAP[toolName] ?? null;
}

export function getToolsForMainDomains(
  domains: readonly MainToolDomain[],
): OpenAI.Responses.Tool[] {
  const selectedDomains = new Set(domains);
  const tools: OpenAI.Responses.Tool[] = [];

  for (const domain of MAIN_TOOL_DOMAIN_ORDER) {
    if (!selectedDomains.has(domain)) {
      continue;
    }

    for (const toolName of DOMAIN_TOOL_ORDER[domain]) {
      const tool = MAIN_TOOL_BY_NAME.get(toolName);

      if (tool) {
        tools.push(tool);
      }
    }
  }

  return tools;
}

export function buildMainToolDomainInventory(): MainToolDomainRecord[] {
  return MAIN_JARVIS_TOOLS.flatMap((tool) => {
    if (tool.type !== "function" || !tool.name) {
      return [];
    }

    const domain = getMainToolDomain(tool.name);

    if (!domain) {
      return [];
    }

    const safety = classifyToolExecutionSafety(tool.name);

    return [
      {
        name: tool.name,
        domain,
        safety: safety === "unknown" ? "write" : safety,
        sideEffects: safety === "write",
        requiresExplicitRequest:
          tool.name.startsWith("create_") ||
          tool.name.startsWith("propose_") ||
          tool.name.startsWith("send_") ||
          tool.name === "complete_task" ||
          tool.name === "save_memory" ||
          tool.name === "update_jarvis_profile",
        mayBeNeededImplicitly:
          tool.name.startsWith("list_") ||
          tool.name.startsWith("get_") ||
          tool.name.startsWith("find_") ||
          tool.name === "confirm_pending_schedule_action" ||
          tool.name === "cancel_pending_schedule_action",
        relatedTools: DOMAIN_TOOL_ORDER[domain].filter(
          (related) => related !== tool.name,
        ),
      },
    ];
  });
}

export function estimateToolSchemaTokensByTool(
  tools: OpenAI.Responses.Tool[] = MAIN_JARVIS_TOOLS,
): Array<{ name: string; estimatedTokens: number; domain: MainToolDomain | null }> {
  return tools.flatMap((tool) => {
    if (tool.type !== "function" || !tool.name) {
      return [];
    }

    return [
      {
        name: tool.name,
        estimatedTokens: estimateTokens(JSON.stringify(tool)),
        domain: getMainToolDomain(tool.name),
      },
    ];
  });
}

export function rankToolSchemasBySize(
  tools: OpenAI.Responses.Tool[] = MAIN_JARVIS_TOOLS,
): Array<{ name: string; estimatedTokens: number; domain: MainToolDomain | null }> {
  return [...estimateToolSchemaTokensByTool(tools)].sort(
    (left, right) => right.estimatedTokens - left.estimatedTokens,
  );
}
