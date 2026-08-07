import "server-only";

export const MORNING_BRIEF_TTS_INSTRUCTION_VERSION = "morning-brief-v1";

export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_TTS_VOICE = "cedar";
export const DEFAULT_TTS_FORMAT = "mp3" as const;

export const MORNING_BRIEF_TTS_INSTRUCTIONS =
  "Deliver the morning briefing in a calm, polished, conversational tone. " +
  "Be concise and natural, like a trusted personal assistant. " +
  "Sound confident but not theatrical. " +
  "Do not imitate or reference any fictional or copyrighted character.";

export type ResolvedTtsConfig = {
  model: string;
  voice: string;
  format: typeof DEFAULT_TTS_FORMAT;
  instructionVersion: typeof MORNING_BRIEF_TTS_INSTRUCTION_VERSION;
  instructions: string;
};

export function resolveMorningBriefTtsConfig(): ResolvedTtsConfig {
  const model = process.env.JARVIS_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  const voice = process.env.JARVIS_TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;

  return {
    model,
    voice,
    format: DEFAULT_TTS_FORMAT,
    instructionVersion: MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
    instructions: MORNING_BRIEF_TTS_INSTRUCTIONS,
  };
}
