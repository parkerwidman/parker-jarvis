import { getGreeting } from "@/lib/jarvis/dashboard/command-center-utils";

export function CommandCenterHeader({
  displayName,
  dateLabel,
  todayDate,
  headerStatus,
  timeZone,
}: {
  displayName: string;
  dateLabel: string;
  todayDate: string;
  headerStatus: string;
  timeZone: string;
}) {
  const greeting = getGreeting(timeZone);

  return (
    <header className="cc-dash-header">
      <div className="cc-dash-header-main">
        <h1 className="cc-dash-greeting">
          {greeting}, <span>{displayName}</span>
        </h1>
        <time className="cc-dash-date" dateTime={todayDate}>
          {dateLabel}
        </time>
        <p className="cc-dash-status">{headerStatus}</p>
      </div>
    </header>
  );
}
