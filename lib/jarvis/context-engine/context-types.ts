import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import type { ScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";

export type ConversationActiveEntity = {
  type: string;
  name: string;
};

export type ConversationStateRecord = {
  conversationId: string;
  userId: string;
  agentKey: "main";
  rollingSummary: string;
  unresolvedQuestions: string[];
  activeEntities: ConversationActiveEntity[];
  decisions: string[];
  summaryThroughMessageId: string | null;
  summaryThroughCreatedAt: string | null;
  summaryVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type StructuredSummaryResult = {
  rollingSummary: string;
  unresolvedQuestions: string[];
  activeEntities: ConversationActiveEntity[];
  decisions: string[];
};

export type ContextEngineDiagnostics = {
  recentMessageCount: number;
  recentEstimatedTokens: number;
  summaryIncluded: boolean;
  summaryEstimatedTokens: number;
  goalsIncluded: number;
  memoriesConsidered: number;
  memoriesIncluded: number;
  coreEstimatedTokens: number;
  optionalContextEstimatedTokens: number;
  conversationInputEstimatedTokens: number;
  estimatedContextTokens: number;
  sectionsTrimmed: string[];
};

export type MainContextEngineInput = {
  userId: string;
  threadId: string | null;
  currentMessage: string;
  contextTarget: JarvisContextTarget | null;
  confirmationIntent: ScheduleConfirmationIntent;
};

export type MainContextEngineOutput = {
  instructions: string;
  conversationInput: Array<{ role: "user" | "assistant"; content: string }>;
  diagnostics: ContextEngineDiagnostics;
  conversationState: ConversationStateRecord | null;
  recentMessages: AgentMessageRecord[];
};

export type SummaryUpdateInput = {
  userId: string;
  threadId: string;
  existingState: ConversationStateRecord | null;
};
