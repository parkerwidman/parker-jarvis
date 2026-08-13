import type {
  ScheduleCategory,
  ScheduleOccurrenceSource,
} from "@/lib/jarvis/schedule/schedule-types";

export type ScheduleEditScope =
  | "this_date_only"
  | "this_and_future"
  | "entire_series";

export type ScheduleDeleteScope =
  | "this_date_only"
  | "this_and_future"
  | "entire_series";

export type ScheduleBlockFormValues = {
  title: string;
  category: ScheduleCategory;
  occurrenceDate: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
  notes: string | null;
};

export type ScheduleBlockEditContext = ScheduleBlockFormValues & {
  scheduleId: string;
  scheduleItemId: string | null;
  overrideId: string | null;
  source: ScheduleOccurrenceSource;
  occurrenceKey: string;
  weekdayLabel: string;
};

export type ScheduleCreateKind = "recurring" | "one_time";

export type ScheduleMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ScheduleRecurringCreateInput = ScheduleBlockFormValues & {
  scheduleId: string;
  effectiveStartDate: string;
};

export type ScheduleOneTimeCreateInput = ScheduleBlockFormValues & {
  scheduleId: string;
};
