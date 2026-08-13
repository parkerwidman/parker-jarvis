import {
  SCHEDULE_GRID_HEIGHT_PX,
  SCHEDULE_HOUR_HEIGHT_PX,
} from "@/lib/jarvis/schedule/schedule-week-view";

type ScheduleTimeRailProps = {
  hourLabels: string[];
};

export function ScheduleTimeRail({ hourLabels }: ScheduleTimeRailProps) {
  return (
    <div
      className="schedule-time-rail"
      style={{ height: `${SCHEDULE_GRID_HEIGHT_PX}px` }}
      aria-hidden="true"
    >
      {hourLabels.map((label, index) => (
        <div
          key={label}
          className="schedule-time-rail-label"
          style={{ top: `${index * SCHEDULE_HOUR_HEIGHT_PX}px` }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
