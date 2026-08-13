import type {
  BaselineScheduleItemTemplate,
  ScheduleCategory,
} from "@/lib/jarvis/schedule/schedule-types";

export const FALL_2026_BASELINE_SCHEDULE_NAME =
  "Fall 2026 — Aug 24 to Oct 18";

export const FALL_2026_BASELINE_START_DATE = "2026-08-24";

export const FALL_2026_BASELINE_END_DATE = "2026-10-18";

export const FALL_2026_BASELINE_EFFECTIVE_START_DATE = "2026-08-24";

type DayBlock = {
  dayOfWeek: number;
  title: string;
  startTime: string;
  endTime: string | null;
  category: ScheduleCategory;
};

function toBaselineItem(
  block: DayBlock,
  sortOrder: number,
): BaselineScheduleItemTemplate {
  return {
    dayOfWeek: block.dayOfWeek,
    effectiveStartDate: FALL_2026_BASELINE_EFFECTIVE_START_DATE,
    effectiveEndDate: null,
    startTime: block.startTime,
    endTime: block.endTime,
    title: block.title,
    category: block.category,
    sortOrder,
  };
}

function blocksForDay(dayOfWeek: number, blocks: Omit<DayBlock, "dayOfWeek">[]) {
  return blocks.map((block, index) =>
    toBaselineItem({ ...block, dayOfWeek }, index),
  );
}

export const FALL_2026_BASELINE_ITEMS: BaselineScheduleItemTemplate[] = [
  ...blocksForDay(0, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "Work Block", startTime: "08:00", endTime: "09:30", category: "work" },
    { title: "Chest/Back", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "BAIS:2800", startTime: "14:30", endTime: "15:20", category: "class" },
    { title: "SEES:1400", startTime: "16:30", endTime: "17:20", category: "class" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(1, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "Work Block", startTime: "08:00", endTime: "09:30", category: "work" },
    { title: "Shoulders/Arms", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(2, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "BAIS:2800", startTime: "08:30", endTime: "09:20", category: "class" },
    { title: "Legs", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "SEES:1400", startTime: "13:00", endTime: "14:15", category: "class" },
    { title: "SEES:1400", startTime: "16:30", endTime: "17:20", category: "class" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(3, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "Work Block", startTime: "08:00", endTime: "09:30", category: "work" },
    { title: "Chest/Back", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(4, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "BAIS:2800", startTime: "08:30", endTime: "09:20", category: "class" },
    { title: "Shoulders/Arms", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(5, [
    { title: "Morning Routine", startTime: "06:30", endTime: "08:00", category: "morning_routine" },
    { title: "Work Block", startTime: "08:00", endTime: "09:30", category: "work" },
    { title: "Legs", startTime: "09:30", endTime: "12:00", category: "gym" },
    { title: "Work Block", startTime: "19:30", endTime: "21:30", category: "work" },
    { title: "Reading", startTime: "21:30", endTime: "22:00", category: "reading" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
  ...blocksForDay(6, [
    { title: "Morning Routine", startTime: "10:00", endTime: "11:30", category: "morning_routine" },
    { title: "Work Block", startTime: "11:30", endTime: "13:00", category: "work" },
    { title: "Active Recovery", startTime: "13:00", endTime: "15:30", category: "recovery" },
    { title: "Meal Prep + Grocery", startTime: "15:30", endTime: "17:00", category: "reset" },
    { title: "Laundry / Upkeep", startTime: "17:00", endTime: "17:30", category: "reset" },
    { title: "Weekly Planning", startTime: "19:30", endTime: "21:00", category: "planning" },
    { title: "Night Routine", startTime: "22:00", endTime: "22:30", category: "night_routine" },
    { title: "Lights Out", startTime: "22:30", endTime: null, category: "sleep" },
  ]),
];

export function serializeBaselineItemsForBootstrap(
  items: BaselineScheduleItemTemplate[] = FALL_2026_BASELINE_ITEMS,
) {
  return items.map((item) => ({
    day_of_week: item.dayOfWeek,
    effective_start_date: item.effectiveStartDate,
    effective_end_date: item.effectiveEndDate,
    start_time: item.startTime,
    end_time: item.endTime,
    title: item.title,
    category: item.category,
    notes: item.notes ?? null,
    metadata: item.metadata ?? {},
    sort_order: item.sortOrder ?? 0,
  }));
}
