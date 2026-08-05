import type { DashboardSchedule } from "@/lib/jarvis/dashboard/build-command-center-view";
import { formatTime } from "@/lib/jarvis/dashboard/command-center-utils";
import { CommandCenterPanel } from "./command-center-panel";

export function TodaysScheduleSection({
  schedule,
  timeZone,
}: {
  schedule: DashboardSchedule;
  timeZone: string;
}) {
  return (
    <CommandCenterPanel
      title="Today's Schedule"
      href="/connections/microsoft"
      hrefLabel="Calendar connection"
      className="cc-panel--schedule"
    >
      {schedule.emptyMessage ? (
        <p className="cc-empty">{schedule.emptyMessage}</p>
      ) : (
        <ul className="cc-dash-schedule">
          {schedule.items.map((item, index) => {
            if (item.kind === "open") {
              const isCountdown = item.label.startsWith("Next event in");
              return (
                <li
                  key={`open-${index}`}
                  className={`cc-dash-schedule-open${isCountdown ? " cc-dash-schedule-open--countdown" : ""}`}
                >
                  {item.label}
                </li>
              );
            }

            if (item.kind === "tomorrow") {
              return (
                <li key={`tomorrow-${item.event.id}`} className="cc-dash-schedule-tomorrow">
                  <span className="cc-dash-schedule-tomorrow-label">{item.label}</span>
                  <span className="cc-dash-schedule-time">
                    {formatTime(item.event.start, timeZone, item.event.isAllDay)}
                  </span>
                  <span className="cc-dash-schedule-title">{item.event.subject}</span>
                </li>
              );
            }

            const statusClass =
              item.status === "current"
                ? " cc-dash-schedule-event--current"
                : item.status === "next"
                  ? " cc-dash-schedule-event--next"
                  : item.status === "past"
                    ? " cc-dash-schedule-event--past"
                    : "";

            return (
              <li
                key={item.event.id}
                className={`cc-dash-schedule-event${statusClass}`}
              >
                <div className="cc-dash-schedule-times">
                  <time dateTime={item.event.start}>
                    {formatTime(item.event.start, timeZone, item.event.isAllDay)}
                  </time>
                  {!item.event.isAllDay ? (
                    <>
                      <span className="cc-dash-schedule-sep">–</span>
                      <time dateTime={item.event.end}>
                        {formatTime(item.event.end, timeZone)}
                      </time>
                    </>
                  ) : null}
                </div>
                <div className="cc-dash-schedule-main">
                  <span className="cc-dash-schedule-title">{item.event.subject}</span>
                  <span className="cc-dash-schedule-badges">
                    {item.status === "current" ? (
                      <span className="cc-dash-schedule-badge cc-dash-schedule-badge--current">
                        Now
                      </span>
                    ) : null}
                    {item.status === "next" ? (
                      <span className="cc-dash-schedule-badge cc-dash-schedule-badge--next">
                        Next
                      </span>
                    ) : null}
                    {item.hasConflict ? (
                      <span className="cc-dash-schedule-badge cc-dash-schedule-badge--conflict">
                        Conflict
                      </span>
                    ) : null}
                    {item.event.locationName ? (
                      <span className="cc-dash-schedule-location">
                        {item.event.locationName}
                      </span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CommandCenterPanel>
  );
}
