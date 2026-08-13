import type { ReactNode } from "react";

import type { ScheduleCategory } from "@/lib/jarvis/schedule/schedule-types";

export type ScheduleCategoryIconName =
  | "class"
  | "gym"
  | "morning_routine"
  | "work"
  | "reading"
  | "night_routine"
  | "sleep"
  | "reset"
  | "planning"
  | "other";

const CATEGORY_ICON_MAP: Record<ScheduleCategory, ScheduleCategoryIconName> = {
  class: "class",
  gym: "gym",
  morning_routine: "morning_routine",
  work: "work",
  reading: "reading",
  night_routine: "night_routine",
  sleep: "sleep",
  reset: "reset",
  planning: "planning",
  recovery: "gym",
  other: "other",
};

export function getScheduleCategoryIconName(
  category: ScheduleCategory,
): ScheduleCategoryIconName {
  return CATEGORY_ICON_MAP[category] ?? "other";
}

type ScheduleCategoryIconProps = {
  category: ScheduleCategory;
  className?: string;
  size?: number;
};

function IconSunrise(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.1 4.1l1.06 1.06M10.84 10.84l1.06 1.06M4.1 11.9l1.06-1.06M10.84 5.16l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.25" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconLaptop(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="7" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.5 12h13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5.5 12v0.8M10.5 12v0.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconClass(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="11" height="7.5" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8 4V2.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconDumbbell(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="5.5" width="2" height="5" rx="0.6" fill="currentColor" opacity="0.85" />
      <rect x="12.5" y="5.5" width="2" height="5" rx="0.6" fill="currentColor" opacity="0.85" />
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconBook(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5V13H4.5A1.5 1.5 0 0 1 3 11.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M8.5 5h4.5A1.5 1.5 0 0 1 14.5 6.5V13H8.5V5Z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

function IconMoon(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.25 2.75a5.25 5.25 0 1 0 3.75 8.75A4.75 4.75 0 0 1 10.25 2.75Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBed(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 10.5V12.5M14 10.5V12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2 10.5h12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="2.5" y="7.5" width="4" height="3" rx="0.6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.5 8.5h6.5a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconReset(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 7.5 8 4l4.5 3.5V12H3.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M6.5 10h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconPlanning(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="11" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 6.5h11M5.5 2v2M10.5 2v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5 9h2M5 11.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconOther(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1" fill="currentColor" />
      <circle cx="8" cy="4" r="1" fill="currentColor" />
      <circle cx="12" cy="4" r="1" fill="currentColor" />
      <circle cx="4" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

const ICON_RENDERERS: Record<
  ScheduleCategoryIconName,
  (size: number) => ReactNode
> = {
  class: IconClass,
  gym: IconDumbbell,
  morning_routine: IconSunrise,
  work: IconLaptop,
  reading: IconBook,
  night_routine: IconMoon,
  sleep: IconBed,
  reset: IconReset,
  planning: IconPlanning,
  other: IconOther,
};

export function ScheduleCategoryIcon({
  category,
  className,
  size = 15,
}: ScheduleCategoryIconProps) {
  const iconName = getScheduleCategoryIconName(category);
  const IconRenderer = ICON_RENDERERS[iconName];

  return (
    <span className={className ?? "schedule-block-icon"} aria-hidden="true">
      {IconRenderer(size)}
    </span>
  );
}

export function ScheduleLegendCategoryIcon({
  category,
  className,
}: {
  category: ScheduleCategory;
  className?: string;
}) {
  return (
    <ScheduleCategoryIcon
      category={category}
      className={className ?? "schedule-legend-icon"}
      size={14}
    />
  );
}
