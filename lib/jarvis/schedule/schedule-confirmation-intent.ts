export type ScheduleConfirmationIntent =
  | "confirm"
  | "cancel"
  | "revise"
  | "unknown";

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

const CANCEL_PATTERNS = [
  /^no[,!.]?$/,
  /^nope[,!.]?$/,
  /^don't do it$/,
  /^do not do it$/,
  /^don't$/,
  /^do not$/,
  /^cancel(?: that| it| this)?[!.]?$/,
  /^never mind[!.]?$/,
  /^nevermind[!.]?$/,
  /^stop[!.]?$/,
  /^leave it[!.]?$/,
];

const CONFIRM_PATTERNS = [
  /^yes[,!.]?$/,
  /^yeah[,!.]?$/,
  /^yep[,!.]?$/,
  /^yup[,!.]?$/,
  /^sure[,!.]?$/,
  /^ok(?:ay)?[,!.]?$/,
  /^do it[!.]?$/,
  /^go ahead[!.]?$/,
  /^confirm(?: it| that| this)?[!.]?$/,
  /^make that change[!.]?$/,
  /^sounds good[!.]?$/,
  /^please do[!.]?$/,
  /^that works[!.]?$/,
];

const REVISE_MARKERS = [
  " but ",
  " instead",
  "actually ",
  "change it to",
  "make it ",
  "rather ",
];

export function detectScheduleConfirmationIntent(
  message: string,
): ScheduleConfirmationIntent {
  const normalized = normalizeMessage(message);

  if (!normalized) {
    return "unknown";
  }

  if (REVISE_MARKERS.some((marker) => normalized.includes(marker.trim()))) {
    return "revise";
  }

  if (normalized.includes("don't") || normalized.includes("do not")) {
    return "cancel";
  }

  for (const pattern of CANCEL_PATTERNS) {
    if (pattern.test(normalized)) {
      return "cancel";
    }
  }

  for (const pattern of CONFIRM_PATTERNS) {
    if (pattern.test(normalized)) {
      return "confirm";
    }
  }

  return "unknown";
}
