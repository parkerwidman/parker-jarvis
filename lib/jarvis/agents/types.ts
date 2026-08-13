export const AGENT_KEYS = ["main", "melusi"] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const MELUSI_THREAD_TYPES = ["command", "research", "campaign"] as const;

export type MelusiThreadType = (typeof MELUSI_THREAD_TYPES)[number];

export const THREAD_STATUSES = ["active", "archived"] as const;

export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const MESSAGE_ROLES = ["user", "assistant"] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export type AgentThreadRecord = {
  id: string;
  userId: string;
  agentKey: AgentKey;
  threadType: MelusiThreadType;
  title: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

export type AgentMessageRecord = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type AgentThreadWithMessages = AgentThreadRecord & {
  messages: AgentMessageRecord[];
};

export type ToolCapabilityGroup =
  | "tasks"
  | "projects"
  | "memory"
  | "microsoft"
  | "main_personal_writes"
  | "action_requests"
  | "personal_finance"
  | "schedule"
  | "melusi_social"
  | "melusi_expenses";

export type AgentConfig = {
  key: AgentKey;
  displayName: string;
  description: string;
  defaultRoute: string;
  supportedThreadTypes: readonly MelusiThreadType[];
  toolGroups: readonly ToolCapabilityGroup[];
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

export function isMelusiThreadType(value: string): value is MelusiThreadType {
  return (MELUSI_THREAD_TYPES as readonly string[]).includes(value);
}

export function isThreadStatus(value: string): value is ThreadStatus {
  return (THREAD_STATUSES as readonly string[]).includes(value);
}

export function isValidThreadId(value: string): boolean {
  return UUID_REGEX.test(value);
}
