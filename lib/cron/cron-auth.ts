import "server-only";

import { timingSafeEqual } from "crypto";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authorizeCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(authHeader);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function resolveJarvisOwnerUserId(): string | null {
  const ownerUserId = process.env.JARVIS_OWNER_USER_ID;

  if (!ownerUserId || !UUID_REGEX.test(ownerUserId)) {
    return null;
  }

  return ownerUserId;
}
