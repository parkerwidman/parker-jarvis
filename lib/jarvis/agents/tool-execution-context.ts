import "server-only";

import type { AgentKey } from "./types";

export type JarvisToolExecutionContext = {
  agentKey: AgentKey;
  toolCallId: string;
  isInteractiveMainJarvisTurn: boolean;
};

export function createInteractiveMainJarvisContext(
  toolCallId: string,
): JarvisToolExecutionContext {
  return {
    agentKey: "main",
    toolCallId,
    isInteractiveMainJarvisTurn: true,
  };
}

export function createMelusiInteractiveContext(
  toolCallId: string,
): JarvisToolExecutionContext {
  return {
    agentKey: "melusi",
    toolCallId,
    isInteractiveMainJarvisTurn: false,
  };
}

export function createNonInteractiveContext(): JarvisToolExecutionContext {
  return {
    agentKey: "main",
    toolCallId: "",
    isInteractiveMainJarvisTurn: false,
  };
}
