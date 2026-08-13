import type {
  JarvisSchedule,
  JarvisScheduleItem,
  JarvisScheduleOverride,
  ScheduleCategory,
  ScheduleStatus,
} from "@/lib/jarvis/schedule/schedule-types";

type ScheduleRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ScheduleItemRow = {
  id: string;
  user_id: string;
  schedule_id: string;
  day_of_week: number;
  effective_start_date: string;
  effective_end_date: string | null;
  start_time: string;
  end_time: string | null;
  title: string;
  category: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ScheduleOverrideRow = {
  id: string;
  user_id: string;
  schedule_id: string;
  schedule_item_id: string | null;
  occurrence_date: string;
  override_type: string;
  start_time: string | null;
  end_time: string | null;
  title: string | null;
  category: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function mapJarvisScheduleRow(row: ScheduleRow): JarvisSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    status: row.status as ScheduleStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapJarvisScheduleItemRow(row: ScheduleItemRow): JarvisScheduleItem {
  return {
    id: row.id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    dayOfWeek: row.day_of_week,
    effectiveStartDate: row.effective_start_date,
    effectiveEndDate: row.effective_end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    category: row.category as ScheduleCategory,
    notes: row.notes,
    metadata: row.metadata ?? {},
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapJarvisScheduleOverrideRow(
  row: ScheduleOverrideRow,
): JarvisScheduleOverride {
  return {
    id: row.id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    scheduleItemId: row.schedule_item_id,
    occurrenceDate: row.occurrence_date,
    overrideType: row.override_type as JarvisScheduleOverride["overrideType"],
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    category: row.category as ScheduleCategory | null,
    notes: row.notes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type {
  ScheduleRow,
  ScheduleItemRow,
  ScheduleOverrideRow,
};
