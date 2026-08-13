export const SCHEDULE_CATEGORIES = [
  "class",
  "gym",
  "morning_routine",
  "work",
  "reading",
  "night_routine",
  "sleep",
  "reset",
  "planning",
  "recovery",
  "other",
] as const;

export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number];

export const SCHEDULE_STATUSES = ["draft", "active", "archived"] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_OVERRIDE_TYPES = ["skip", "replace", "add"] as const;

export type ScheduleOverrideType = (typeof SCHEDULE_OVERRIDE_TYPES)[number];

export const PENDING_SCHEDULE_ACTION_TYPES = [
  "add",
  "update",
  "move",
  "remove",
  "skip",
] as const;

export type PendingScheduleActionType =
  (typeof PENDING_SCHEDULE_ACTION_TYPES)[number];

export const PENDING_SCHEDULE_ACTION_STATUSES = [
  "pending",
  "confirmed",
  "executed",
  "cancelled",
  "expired",
  "failed",
] as const;

export type PendingScheduleActionStatus =
  (typeof PENDING_SCHEDULE_ACTION_STATUSES)[number];

export type ScheduleOccurrenceSource = "recurring" | "replaced" | "added";

export type JarvisSchedule = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
};

export type JarvisScheduleItem = {
  id: string;
  userId: string;
  scheduleId: string;
  dayOfWeek: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  startTime: string;
  endTime: string | null;
  title: string;
  category: ScheduleCategory;
  notes: string | null;
  metadata: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type JarvisScheduleOverride = {
  id: string;
  userId: string;
  scheduleId: string;
  scheduleItemId: string | null;
  occurrenceDate: string;
  overrideType: ScheduleOverrideType;
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  category: ScheduleCategory | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleOccurrence = {
  occurrenceKey: string;
  scheduleId: string;
  scheduleItemId: string | null;
  overrideId: string | null;
  occurrenceDate: string;
  dayOfWeek: number;
  title: string;
  category: ScheduleCategory;
  notes: string | null;
  localStart: string;
  localEnd: string | null;
  localStartTime: string;
  localEndTime: string | null;
  timezone: string;
  source: ScheduleOccurrenceSource;
  isOverridden: boolean;
  isOpenEnded: boolean;
  hasConflict: boolean;
  sortOrder: number;
};

export type ScheduleConflict = {
  occurrenceKey: string;
  conflictingOccurrenceKey: string;
};

export type BaselineScheduleItemTemplate = {
  dayOfWeek: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  startTime: string;
  endTime: string | null;
  title: string;
  category: ScheduleCategory;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
};

export type ScheduleRangeLoadResult = {
  schedule: JarvisSchedule;
  items: JarvisScheduleItem[];
  overrides: JarvisScheduleOverride[];
  occurrences: ScheduleOccurrence[];
  conflicts: ScheduleConflict[];
};
