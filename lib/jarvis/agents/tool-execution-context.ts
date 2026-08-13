import "server-only";

import type { AgentKey } from "./types";

export type JarvisToolExecutionContext = {
  agentKey: AgentKey;
  toolCallId: string;
  isInteractiveMainJarvisTurn: boolean;
  threadId: string | null;
};

export function createInteractiveMainJarvisContext(
  toolCallId: string,
  threadId: string | null = null,
): JarvisToolExecutionContext {
  return {
    agentKey: "main",
    toolCallId,
    isInteractiveMainJarvisTurn: true,
    threadId,
  };
}

export function createMelusiInteractiveContext(
  toolCallId: string,
  threadId: string | null = null,
): JarvisToolExecutionContext {
  return {
    agentKey: "melusi",
    toolCallId,
    isInteractiveMainJarvisTurn: false,
    threadId,
  };
}

export function createNonInteractiveContext(): JarvisToolExecutionContext {
  return {
    agentKey: "main",
    toolCallId: "",
    isInteractiveMainJarvisTurn: false,
    threadId: null,
  };
}
