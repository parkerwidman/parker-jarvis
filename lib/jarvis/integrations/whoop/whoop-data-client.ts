import "server-only";

import { WHOOP_API_BASE } from "@/lib/jarvis/integrations/whoop/whoop-config";
import type { WhoopPaginatedResponse } from "@/lib/jarvis/integrations/whoop/whoop-api-types";
import {
  WHOOP_DATA_REQUEST_TIMEOUT_MS,
  WHOOP_SYNC_MAX_PAGES,
  WHOOP_SYNC_PAGE_LIMIT,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import {
  WHOOP_SYNC_ERROR_CODES,
  WhoopSyncError,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

export type WhoopDataFetchParams = {
  accessToken: string;
  path: string;
  start?: string;
  end?: string;
  nextToken?: string;
};

function buildWhoopDataUrl(params: WhoopDataFetchParams): URL {
  const url = new URL(`${WHOOP_API_BASE}${params.path}`);

  if (params.start) {
    url.searchParams.set("start", params.start);
  }

  if (params.end) {
    url.searchParams.set("end", params.end);
  }

  url.searchParams.set("limit", String(WHOOP_SYNC_PAGE_LIMIT));

  if (params.nextToken) {
    url.searchParams.set("nextToken", params.nextToken);
  }

  return url;
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");

  if (!header) {
    return null;
  }

  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(header);

  if (Number.isFinite(retryAt)) {
    const delay = retryAt - Date.now();
    return delay > 0 ? delay : null;
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function validateWhoopPaginatedPayload(
  payload: unknown,
): WhoopPaginatedResponse<unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const candidate = payload as WhoopPaginatedResponse<unknown>;

  if (candidate.records !== undefined && !Array.isArray(candidate.records)) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  if (
    candidate.next_token !== undefined &&
    candidate.next_token !== null &&
    typeof candidate.next_token !== "string"
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return candidate;
}

export function extractWhoopNextToken(
  payload: WhoopPaginatedResponse<unknown>,
): string | null {
  const token = payload.next_token;

  if (typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function whoopDataFetchOnce(
  params: WhoopDataFetchParams,
): Promise<Response> {
  const url = buildWhoopDataUrl(params);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
      signal: AbortSignal.timeout(WHOOP_DATA_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.providerFailed);
  }
}

export async function whoopDataFetch(params: WhoopDataFetchParams): Promise<Response> {
  let response = await whoopDataFetchOnce(params);

  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response);

    if (retryAfterMs !== null && retryAfterMs <= 60_000) {
      await sleep(retryAfterMs);
      response = await whoopDataFetchOnce(params);
    }
  }

  if (response.status === 401) {
    throw new WhoopSyncError(
      WHOOP_SYNC_ERROR_CODES.reconnectRequired,
      undefined,
      401,
    );
  }

  if (response.status >= 500) {
    throw new WhoopSyncError(
      WHOOP_SYNC_ERROR_CODES.providerFailed,
      undefined,
      response.status,
    );
  }

  if (!response.ok) {
    throw new WhoopSyncError(
      WHOOP_SYNC_ERROR_CODES.providerFailed,
      undefined,
      response.status,
    );
  }

  return response;
}

export async function fetchWhoopJson<T>(params: WhoopDataFetchParams): Promise<T> {
  const response = await whoopDataFetch(params);

  try {
    return (await response.json()) as T;
  } catch {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }
}

export async function fetchWhoopPaginatedCollection<T>(params: {
  accessToken: string;
  path: string;
  start: string;
  end: string;
  parseRecord: (record: unknown) => T;
}): Promise<T[]> {
  const results: T[] = [];
  let nextToken: string | null = null;
  const seenTokens = new Set<string>();

  for (let page = 0; page < WHOOP_SYNC_MAX_PAGES; page += 1) {
    const payload = validateWhoopPaginatedPayload(
      await fetchWhoopJson<unknown>({
        accessToken: params.accessToken,
        path: params.path,
        start: params.start,
        end: params.end,
        nextToken: nextToken ?? undefined,
      }),
    );

    const records = payload.records ?? [];

    for (const record of records) {
      results.push(params.parseRecord(record));
    }

    const upcomingToken = extractWhoopNextToken(payload);

    if (!upcomingToken) {
      return results;
    }

    if (seenTokens.has(upcomingToken)) {
      throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
    }

    seenTokens.add(upcomingToken);
    nextToken = upcomingToken;
  }

  throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.paginationLimitExceeded);
}
