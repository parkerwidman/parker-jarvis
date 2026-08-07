import "server-only";

import { createHash } from "node:crypto";

export type TtsContentHashInput = {
  text: string;
  model: string;
  voice: string;
  format: string;
  instructionVersion: string;
};

function stableSerialize(input: TtsContentHashInput): string {
  const payload = {
    format: input.format,
    instructionVersion: input.instructionVersion,
    model: input.model,
    text: input.text,
    voice: input.voice,
  };

  return JSON.stringify(payload);
}

export function computeTtsContentHash(input: TtsContentHashInput): string {
  return createHash("sha256")
    .update(stableSerialize(input), "utf8")
    .digest("hex");
}
