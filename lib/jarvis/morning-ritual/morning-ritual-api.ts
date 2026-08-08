import { buildAudioFetchUrl, mapAudioFetchPayload } from "@/lib/jarvis/briefings/briefing-audio-player";

import {
  parseMorningRitualCompleteResponse,
  parseMorningRitualStartResponse,
  type MorningRitualCompleteResult,
  type MorningRitualStartResult,
} from "@/lib/jarvis/morning-ritual/morning-ritual-playback";

export type SignedAudioUrlResult =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; reason: string };

async function readJsonPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // Fall through to empty payload.
  }

  return {};
}

export async function fetchMorningRitualSignedAudioUrl(
  briefingDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignedAudioUrlResult> {
  try {
    const response = await fetchImpl(buildAudioFetchUrl(briefingDate), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    const payload = await readJsonPayload(response);
    const mapped = mapAudioFetchPayload(payload);

    if (mapped.ok) {
      return mapped;
    }

    return { ok: false, reason: mapped.reason };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function startMorningRitualRequest(
  briefingDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; result: MorningRitualStartResult }
  | { ok: false; reason: string }
> {
  try {
    const response = await fetchImpl("/api/rituals/morning/start", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingDate }),
    });

    const payload = await readJsonPayload(response);
    return parseMorningRitualStartResponse({
      result: typeof payload.result === "string" ? payload.result : undefined,
      error: typeof payload.error === "string" ? payload.error : undefined,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function completeMorningRitualRequest(
  briefingDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; result: MorningRitualCompleteResult }
  | { ok: false; reason: string }
> {
  try {
    const response = await fetchImpl("/api/rituals/morning/complete", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingDate }),
    });

    const payload = await readJsonPayload(response);
    return parseMorningRitualCompleteResponse({
      result: typeof payload.result === "string" ? payload.result : undefined,
      error: typeof payload.error === "string" ? payload.error : undefined,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function ensureMorningBriefTimelineRequest(
  briefingDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; reused: boolean } | { ok: false; reason: string }> {
  try {
    const response = await fetchImpl("/api/briefings/audio/timeline/ensure", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingDate }),
    });

    const payload = await readJsonPayload(response);

    if (payload.status === "ready" || payload.status === "already_ready") {
      return { ok: true, reused: payload.reused === true };
    }

    return {
      ok: false,
      reason:
        (typeof payload.error === "string" ? payload.error : undefined) ??
        (typeof payload.status === "string" ? payload.status : undefined) ??
        "unavailable",
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
