import type { FitnessGlanceSnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessTodayAtAGlanceProps = {
  glance: FitnessGlanceSnapshot;
};

const CHART_SLOT_COUNT = 12;

export function FitnessTodayAtAGlance({ glance }: FitnessTodayAtAGlanceProps) {
  const completionRatio =
    glance.totalTracked > 0
      ? Math.round((glance.completedToday / glance.totalTracked) * 100)
      : 0;

  const metrics = [
    {
      label: "Tasks completed",
      value:
        glance.totalTracked > 0
          ? `${glance.completedToday}/${glance.totalTracked}`
          : String(glance.completedToday),
    },
    { label: "Open tasks", value: String(glance.openTasks) },
    { label: "Meetings today", value: String(glance.meetingsToday) },
    { label: "Active goals", value: String(glance.activeGoals) },
  ];

  return (
    <section className="fit-panel fit-glance-panel" aria-label="Today at a glance">
      <header className="fit-panel-head">
        <h2 className="fit-panel-title">Today at a Glance</h2>
      </header>

      <ul className="fit-glance-list">
        {metrics.map((metric) => (
          <li key={metric.label} className="fit-glance-row">
            <span className="fit-glance-label">{metric.label}</span>
            <span className="fit-glance-value">{metric.value}</span>
          </li>
        ))}
      </ul>

      <div
        className="fit-glance-chart"
        aria-label={`Task completion today ${completionRatio} percent`}
      >
        <div className="fit-glance-chart-bars" aria-hidden="true">
          {Array.from({ length: CHART_SLOT_COUNT }, (_, index) => (
            <span
              key={index}
              className="fit-glance-chart-bar"
              style={{
                height:
                  completionRatio > 0 && index === CHART_SLOT_COUNT - 1
                    ? `${Math.max(completionRatio, 12)}%`
                    : "8%",
              }}
            />
          ))}
        </div>
        <div className="fit-glance-chart-axis" aria-hidden="true">
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      </div>
    </section>
  );
}
