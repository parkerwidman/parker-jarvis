import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
} from "openai";

import type { ResolvedTtsConfig } from "@/lib/jarvis/audio/tts-config";

export type CreateSpeechResult =
  | { success: true; audioBytes: Uint8Array }
  | {
      success: false;
      errorCode: "tts_timeout" | "tts_rate_limited" | "tts_failed";
    };

function getOpenAiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

export async function createSpeechAudio(
  text: string,
  config: ResolvedTtsConfig,
  client?: OpenAI,
): Promise<CreateSpeechResult> {
  const openai = client ?? getOpenAiClient();

  if (!openai) {
    return { success: false, errorCode: "tts_failed" };
  }

  try {
    const response = await openai.audio.speech.create({
      input: text,
      model: config.model,
      voice: config.voice,
      response_format: config.format,
      instructions: config.instructions,
    });

    const buffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(buffer);

    if (audioBytes.byteLength === 0) {
      return { success: false, errorCode: "tts_failed" };
    }

    return { success: true, audioBytes };
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      return { success: false, errorCode: "tts_timeout" };
    }

    if (error instanceof RateLimitError) {
      return { success: false, errorCode: "tts_rate_limited" };
    }

    if (error instanceof APIConnectionError) {
      return { success: false, errorCode: "tts_failed" };
    }

    return { success: false, errorCode: "tts_failed" };
  }
}
