"use client";

import type { CommandCenterCalendarEvent } from "@/lib/jarvis/dashboard/load-command-center";

type CalendarPulseProps = {
  events: CommandCenterCalendarEvent[];
  connected: boolean;
  needsReconnect: boolean;
  timeZone: string;
  todayDate: string;
};

function formatEventTime(
  event: CommandCenterCalendarEvent,
  timeZone: string,
): string {
  if (event.isAllDay) {
    return "All day";
  }

  return new Date(event.start).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function CalendarPulse({
  events,
  connected,
  needsReconnect,
  timeZone,
  todayDate,
}: CalendarPulseProps) {
  const todayEvents = events.filter((event) => {
    const eventDate = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(event.start));

    return eventDate === todayDate;
  });

  let emptyMessage: string | null = null;
  if (needsReconnect) {
    emptyMessage = "Microsoft 365 needs to be reconnected to show calendar.";
  } else if (!connected) {
    emptyMessage = "Outlook is not connected. Connect Microsoft to see your calendar.";
  } else if (todayEvents.length === 0) {
    emptyMessage = "No events scheduled for today.";
  }

  return (
    <div className="cc2-pulse-panel">
      <div className="cc2-pulse-head">
        <span className="cc2-pulse-head-title">Today&apos;s calendar</span>
      </div>

      {emptyMessage ? (
        <p className="cc2-pulse-empty">{emptyMessage}</p>
      ) : (
        todayEvents.map((event, index) => (
          <div key={`${event.start}-${event.subject}-${index}`} className="cc2-cal-row">
            <span className="cc2-cal-time">
              {formatEventTime(event, timeZone)}
            </span>
            <div>
              <div className="cc2-cal-name">{event.subject}</div>
              {event.locationName ? (
                <span className="cc2-cal-with">{event.locationName}</span>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
