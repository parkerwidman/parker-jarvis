"use client";

type ScheduleWeekNavProps = {
  weekLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

function NavIconChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={direction === "left" ? "M10 4L6 8l4 4" : "M6 4l4 4-4 4"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScheduleWeekNav({
  weekLabel,
  onPrevious,
  onNext,
  onToday,
}: ScheduleWeekNavProps) {
  return (
    <div className="schedule-week-nav">
      <div className="schedule-week-nav-controls">
        <button
          type="button"
          className="schedule-icon-button"
          onClick={onPrevious}
          aria-label="Previous week"
        >
          <NavIconChevron direction="left" />
        </button>
        <button
          type="button"
          className="schedule-icon-button"
          onClick={onNext}
          aria-label="Next week"
        >
          <NavIconChevron direction="right" />
        </button>
        <button
          type="button"
          className="schedule-text-button"
          onClick={onToday}
        >
          Today
        </button>
      </div>

      <div className="schedule-week-nav-label">{weekLabel}</div>

      <button
        type="button"
        className="schedule-icon-button schedule-icon-button--disabled"
        disabled
        aria-label="Schedule settings (read-only in this version)"
        title="Schedule editing arrives in a future update."
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
