import {
  getLocalDateFromIso,
  getLocalDateString,
} from "@/lib/jarvis/dashboard/command-center-utils";

export type RecoveryStatus = {
  label: "Strong" | "Moderate" | "Low";
  level: "strong" | "moderate" | "low";
};

export function getRecoveryStatus(score: number): RecoveryStatus {
  if (score >= 67) {
    return { label: "Strong", level: "strong" };
  }

  if (score >= 34) {
    return { label: "Moderate", level: "moderate" };
  }

  return { label: "Low", level: "low" };
}

export function formatSleepDuration(totalMs: number): string {
  const totalMinutes = Math.max(0, Math.round(totalMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

export function formatDurationBetween(
  startIso: string,
  endIso: string | null,
): string | null {
  if (!endIso) {
    return null;
  }

  const durationMs = new Date(endIso).getTime() - new Date(startIso).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return formatSleepDuration(durationMs);
}

export function kilojoulesToKilocalories(kilojoule: number): number {
  return Math.round((kilojoule / 4.184) * 10) / 10;
}

export function kilogramsToPounds(kilograms: number): number {
  return Math.round(kilograms * 2.2046226218 * 10) / 10;
}

export function formatSyncFreshness(
  isoString: string | null,
  timeZone: string,
  now = new Date(),
): string {
  if (!isoString) {
    return "Never synced";
  }

  const syncedAt = new Date(isoString);
  const elapsedMs = now.getTime() - syncedAt.getTime();

  if (elapsedMs < 60_000) {
    return "Just synced";
  }

  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const syncedLocalDate = getLocalDateFromIso(isoString, timeZone);
  const todayLocalDate = getLocalDateString(timeZone, now);
  const yesterdayLocalDate = getLocalDateString(
    timeZone,
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
  );

  if (syncedLocalDate === yesterdayLocalDate) {
    return "Yesterday";
  }

  return syncedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function formatLocalTimestamp(
  isoString: string | null,
  timeZone: string,
): string | null {
  if (!isoString) {
    return null;
  }

  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}
