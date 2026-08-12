import {
  countTrendPointsWithData,
  normalizeStrainForChart,
} from "@/lib/jarvis/fitness/fitness-trend-selection";
import type { FitnessTrendDay } from "@/lib/jarvis/fitness/fitness-today-types";

type FitnessTrendsChartProps = {
  trends: FitnessTrendDay[];
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = { top: 8, right: 8, bottom: 22, left: 28 };
const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

function buildLinePoints(
  days: FitnessTrendDay[],
  getValue: (day: FitnessTrendDay) => number | null,
  normalize?: (value: number) => number,
): string | null {
  const points: string[] = [];

  days.forEach((day, index) => {
    const raw = getValue(day);

    if (raw == null) {
      return;
    }

    const value = normalize ? normalize(raw) : raw;
    const x =
      days.length === 1
        ? CHART_PADDING.left + PLOT_WIDTH / 2
        : CHART_PADDING.left + (index / (days.length - 1)) * PLOT_WIDTH;
    const y =
      CHART_PADDING.top + PLOT_HEIGHT - (Math.max(0, Math.min(100, value)) / 100) * PLOT_HEIGHT;

    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  return points.length >= 2 ? points.join(" ") : null;
}

function buildAccessibleSummary(days: FitnessTrendDay[]): string {
  const withData = countTrendPointsWithData(days);

  if (withData < 2) {
    return "Trend history will appear after more WHOOP data is synced.";
  }

  const latest = days[days.length - 1];
  const parts: string[] = [];

  if (latest.recoveryScore != null) {
    parts.push(`recovery ${latest.recoveryScore}`);
  }

  if (latest.sleepPerformancePct != null) {
    parts.push(`sleep ${Math.round(latest.sleepPerformancePct)} percent`);
  }

  if (latest.strain != null) {
    parts.push(`strain ${latest.strain.toFixed(1)}`);
  }

  return `Seven-day overview with ${withData} days of data. Latest: ${parts.join(", ") || "no scored metrics"}.`;
}

export function FitnessTrendsChart({ trends }: FitnessTrendsChartProps) {
  const dataPointCount = countTrendPointsWithData(trends);
  const recoveryLine = buildLinePoints(trends, (day) => day.recoveryScore);
  const sleepLine = buildLinePoints(trends, (day) => day.sleepPerformancePct);
  const strainLine = buildLinePoints(
    trends,
    (day) => day.strain,
    normalizeStrainForChart,
  );
  const hasChart = dataPointCount >= 2;

  return (
    <section className="fit-panel fit-trends-panel" aria-label="Trends seven-day overview">
      <header className="fit-panel-head">
        <h2 className="fit-panel-title">Trends (7-Day Overview)</h2>
      </header>

      <div className="fit-trends-legend" aria-hidden="true">
        <span className="fit-trends-legend-item fit-trends-legend-item--recovery">
          Recovery
        </span>
        <span className="fit-trends-legend-item fit-trends-legend-item--sleep">
          Sleep
        </span>
        <span className="fit-trends-legend-item fit-trends-legend-item--strain">
          Strain
        </span>
      </div>

      {hasChart ? (
        <svg
          className="fit-trends-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={buildAccessibleSummary(trends)}
        >
          {[25, 50, 75].map((tick) => {
            const y =
              CHART_PADDING.top +
              PLOT_HEIGHT -
              (tick / 100) * PLOT_HEIGHT;

            return (
              <g key={tick}>
                <line
                  x1={CHART_PADDING.left}
                  y1={y}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y2={y}
                  stroke="rgba(148,163,184,0.08)"
                  strokeWidth="1"
                />
                <text
                  x={CHART_PADDING.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(148,163,184,0.55)"
                  fontSize="8"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {trends.map((day, index) => {
            const x =
              trends.length === 1
                ? CHART_PADDING.left + PLOT_WIDTH / 2
                : CHART_PADDING.left + (index / (trends.length - 1)) * PLOT_WIDTH;

            return (
              <text
                key={day.date}
                x={x}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                fill="rgba(148,163,184,0.62)"
                fontSize="8"
              >
                {day.dateLabel}
              </text>
            );
          })}

          {recoveryLine ? (
            <polyline
              points={recoveryLine}
              fill="none"
              stroke="var(--jarvis-accent-fitness-recovery)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {sleepLine ? (
            <polyline
              points={sleepLine}
              fill="none"
              stroke="var(--jarvis-accent-fitness-sleep)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {strainLine ? (
            <polyline
              points={strainLine}
              fill="none"
              stroke="var(--jarvis-accent-fitness-strain)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 3"
            />
          ) : null}
        </svg>
      ) : (
        <div className="fit-trends-empty">
          <p>Trend history will appear after more WHOOP data is synced.</p>
        </div>
      )}

      {hasChart ? (
        <p className="fit-trends-note">
          Strain line is normalized for chart scale; values shown elsewhere remain raw strain.
        </p>
      ) : null}
    </section>
  );
}
