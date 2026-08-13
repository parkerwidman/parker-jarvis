import { ScheduleBlock } from "@/components/schedule/schedule-block";
import { ScheduleTimeRail } from "@/components/schedule/schedule-time-rail";
import {
  SCHEDULE_GRID_HEIGHT_PX,
  SCHEDULE_HOUR_HEIGHT_PX,
  type ScheduleBlockViewModel,
  type ScheduleWeekViewModel,
} from "@/lib/jarvis/schedule/schedule-week-view";

type ScheduleWeekGridProps = {
  viewModel: ScheduleWeekViewModel;
  onBlockSelect?: (block: ScheduleBlockViewModel) => void;
};

export function ScheduleWeekGrid({
  viewModel,
  onBlockSelect,
}: ScheduleWeekGridProps) {
  const hourLineCount =
    viewModel.hourLabels.length > 0 ? viewModel.hourLabels.length - 1 : 0;

  return (
    <div className="schedule-grid-scroll">
      <div className="schedule-grid">
        <div className="schedule-grid-header">
          <div className="schedule-grid-corner" aria-hidden="true" />
          {viewModel.days.map((day) => (
            <div
              key={day.date}
              className={`schedule-day-header${day.isToday ? " schedule-day-header--today" : ""}`}
            >
              <span className="schedule-day-header-weekday">{day.weekdayLabel}</span>
              <span className="schedule-day-header-date">{day.dayNumber}</span>
            </div>
          ))}
        </div>

        <div className="schedule-grid-body">
          <ScheduleTimeRail hourLabels={viewModel.hourLabels} />

          <div className="schedule-day-columns">
            {viewModel.days.map((day) => {
              const dayBlocks = viewModel.blocks.filter(
                (block) => block.date === day.date,
              );

              return (
                <div
                  key={day.date}
                  className={`schedule-day-column${day.isToday ? " schedule-day-column--today" : ""}`}
                  style={{ height: `${SCHEDULE_GRID_HEIGHT_PX}px` }}
                >
                  <div className="schedule-day-grid-lines" aria-hidden="true">
                    {Array.from({ length: hourLineCount }).map((_, index) => (
                      <div
                        key={index}
                        className="schedule-day-grid-line"
                        style={{ top: `${(index + 1) * SCHEDULE_HOUR_HEIGHT_PX}px` }}
                      />
                    ))}
                  </div>

                  {dayBlocks.map((block) => (
                    <ScheduleBlock
                      key={block.occurrenceKey}
                      block={block}
                      onSelect={onBlockSelect}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
