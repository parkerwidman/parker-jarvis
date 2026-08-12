"use client";

import Link from "next/link";

import type { CommandCenterCalendarEvent } from "@/lib/jarvis/dashboard/load-command-center";

type CalendarPulseProps = {
  events: CommandCenterCalendarEvent[];
  connected: boolean;
  needsReconnect: boolean;
  timeZone: string;
  todayDate: string;
};

function CalendarEmptyIllustration() {
  return (
    <div className="cc2-cal-empty-state">
      <div className="cc2-cal-empty-orbit" aria-hidden="true">
        <span className="cc2-cal-empty-ring cc2-cal-empty-ring--outer" />
        <span className="cc2-cal-empty-ring cc2-cal-empty-ring--inner" />
        <span className="cc2-cal-empty-core" />
      </div>
      <p className="cc2-cal-empty-title">No events scheduled today.</p>
      <p className="cc2-cal-empty-sub">Your day is clear.</p>
    </div>
  );
}

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
  let showDesignedEmpty = false;

  if (needsReconnect) {
    emptyMessage = "Microsoft 365 needs to be reconnected to show calendar.";
  } else if (!connected) {
    emptyMessage = "Outlook is not connected. Connect Microsoft to see your calendar.";
  } else if (todayEvents.length === 0) {
    showDesignedEmpty = true;
  }

  return (
    <div className="cc2-pulse-panel cc2-pulse-panel--calendar">
      <div className="cc2-pulse-head">
        <span className="cc2-pulse-head-title">Today&apos;s calendar</span>
      </div>

      <div
        className="cc2-panel-scroll cc2-pulse-scroll cc2-cal-scroll"
        aria-label="Today's calendar events"
        tabIndex={0}
      >
        {showDesignedEmpty ? (
          <CalendarEmptyIllustration />
        ) : emptyMessage ? (
          <p className="cc2-pulse-empty">{emptyMessage}</p>
        ) : (
          <div className="cc2-cal-list">
            {todayEvents.map((event, index) => (
              <div key={`${event.start}-${event.subject}-${index}`} className="cc2-cal-row">
                <time className="cc2-cal-time">
                  {formatEventTime(event, timeZone)}
                </time>
                <div className="cc2-cal-name">{event.subject}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {connected ? (
        <Link href="/connections/microsoft" className="cc2-pulse-foot-link">
          View full day
        </Link>
      ) : null}
    </div>
  );
}
