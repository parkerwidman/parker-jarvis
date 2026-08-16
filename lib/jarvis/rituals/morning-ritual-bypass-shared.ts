export const MORNING_RITUAL_BYPASS_COOKIE = "jarvis-morning-ritual-bypass";

export const MORNING_RITUAL_BYPASS_MAX_AGE_SECONDS = 60 * 60 * 24;

const RITUAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidRitualDate(value: string): boolean {
  return RITUAL_DATE_PATTERN.test(value);
}
