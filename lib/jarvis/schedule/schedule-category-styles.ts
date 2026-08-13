import type { ScheduleCategory } from "@/lib/jarvis/schedule/schedule-types";

export type ScheduleCategoryStyle = {
  className: string;
  label: string;
  legendOrder: number;
};

export const SCHEDULE_CATEGORY_STYLES: Record<
  ScheduleCategory,
  ScheduleCategoryStyle
> = {
  class: { className: "schedule-block--class", label: "Class", legendOrder: 1 },
  gym: { className: "schedule-block--gym", label: "Gym", legendOrder: 2 },
  morning_routine: {
    className: "schedule-block--morning-routine",
    label: "Morning Routine",
    legendOrder: 3,
  },
  work: { className: "schedule-block--work", label: "Work Block", legendOrder: 4 },
  reading: { className: "schedule-block--reading", label: "Reading", legendOrder: 5 },
  night_routine: {
    className: "schedule-block--night-routine",
    label: "Night Routine",
    legendOrder: 6,
  },
  sleep: { className: "schedule-block--sleep", label: "Sleep", legendOrder: 7 },
  reset: { className: "schedule-block--reset", label: "Reset", legendOrder: 8 },
  planning: {
    className: "schedule-block--planning",
    label: "Planning",
    legendOrder: 9,
  },
  recovery: {
    className: "schedule-block--recovery",
    label: "Recovery",
    legendOrder: 10,
  },
  other: { className: "schedule-block--other", label: "Other", legendOrder: 11 },
};

export function getScheduleCategoryClassName(
  category: ScheduleCategory,
): string {
  const visualCategory = category === "recovery" ? "gym" : category;
  return (
    SCHEDULE_CATEGORY_STYLES[visualCategory]?.className ?? "schedule-block--other"
  );
}

export function getScheduleVisualCategory(
  category: ScheduleCategory,
): ScheduleCategory {
  return category === "recovery" ? "gym" : category;
}

export function getScheduleCategoryLabel(category: ScheduleCategory): string {
  return SCHEDULE_CATEGORY_STYLES[category]?.label ?? "Other";
}

export function sortCategoriesForLegend(
  categories: ScheduleCategory[],
): ScheduleCategory[] {
  const normalized = categories.map((category) =>
    category === "recovery" ? "gym" : category,
  );

  return [...new Set(normalized)].sort(
    (left, right) =>
      SCHEDULE_CATEGORY_STYLES[left].legendOrder -
      SCHEDULE_CATEGORY_STYLES[right].legendOrder,
  );
}
