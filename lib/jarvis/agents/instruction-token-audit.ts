import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import { MAIN_JARVIS_RESPONSE_PRESENTATION } from "@/lib/jarvis/agents/main-response-presentation";
import { estimateTokens } from "@/lib/jarvis/context-engine/context-budget";

export type InstructionModuleAudit = {
  module: string;
  estimatedTokens: number;
  purpose: string;
  duplicationCandidates: string[];
  safetySensitive: boolean;
};

export function auditMainInstructionModules(): InstructionModuleAudit[] {
  return [
    {
      module: "BASE_MAIN_JARVIS_INSTRUCTIONS",
      estimatedTokens: estimateTokens(BASE_MAIN_JARVIS_INSTRUCTIONS),
      purpose: "Core behavioral rules, tool usage policy, and domain disambiguation.",
      duplicationCandidates: [
        "Task creation rules appear in both the opening paragraph and Direct task creation.",
        "Schedule confirm/cancel flow overlaps with pending-action runtime section.",
        "No fake success appears in both base instructions and response presentation.",
        "Jarvis Schedule vs Outlook guidance appears in multiple sections.",
      ],
      safetySensitive: true,
    },
    {
      module: "MAIN_JARVIS_RESPONSE_PRESENTATION",
      estimatedTokens: estimateTokens(MAIN_JARVIS_RESPONSE_PRESENTATION),
      purpose: "Adaptive Markdown and action-outcome presentation rules.",
      duplicationCandidates: [
        "No fake success overlaps with base instructions.",
      ],
      safetySensitive: true,
    },
  ];
}

export function estimateCoreInstructionTokens(): number {
  return (
    estimateTokens(BASE_MAIN_JARVIS_INSTRUCTIONS) +
    estimateTokens(MAIN_JARVIS_RESPONSE_PRESENTATION)
  );
}
