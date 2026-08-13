"use client";

import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";
import { formatSchedulePeriodRange } from "@/lib/jarvis/schedule/schedule-week-view";

type SchedulePeriodSelectorProps = {
  schedules: JarvisSchedule[];
  selectedScheduleId: string;
  onSelectSchedule: (scheduleId: string) => void;
};

export function SchedulePeriodSelector({
  schedules,
  selectedScheduleId,
  onSelectSchedule,
}: SchedulePeriodSelectorProps) {
  if (schedules.length === 0) {
    return null;
  }

  if (schedules.length === 1) {
    const schedule = schedules[0]!;

    return (
      <div className="schedule-period-selector schedule-period-selector--single">
        <span className="schedule-period-pill schedule-period-pill--active">
          {schedule.name}
        </span>
        <span className="schedule-period-range">
          {formatSchedulePeriodRange(schedule)}
        </span>
      </div>
    );
  }

  return (
    <div
      className="schedule-period-selector"
      role="tablist"
      aria-label="Schedule periods"
    >
      {schedules.map((schedule) => {
        const active = schedule.id === selectedScheduleId;

        return (
          <button
            key={schedule.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`schedule-period-pill${active ? " schedule-period-pill--active" : ""}`}
            onClick={() => onSelectSchedule(schedule.id)}
          >
            <span className="schedule-period-pill-name">{schedule.name}</span>
            <span className="schedule-period-pill-range">
              {formatSchedulePeriodRange(schedule)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
