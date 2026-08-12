"use client";

import { useCommandCenterMode } from "./command-center-mode-provider";
import {
  itemMatchesMode,
} from "@/lib/jarvis/dashboard/command-center-mode";
import type { CommandCenterData } from "@/lib/jarvis/dashboard/load-command-center";

type TodayAtAGlanceProps = {
  data: CommandCenterData;
  todayEventCount: number;
};

const CHART_SLOT_COUNT = 12;

export function TodayAtAGlance({ data, todayEventCount }: TodayAtAGlanceProps) {
  const { mode } = useCommandCenterMode();

  const modeTasks = data.kanbanTasks.filter((task) =>
    itemMatchesMode(task.lifeAreaName, mode),
  );
  const openTasks = modeTasks.filter((task) => task.status !== "done").length;
  const doneToday = modeTasks.filter((task) => task.completedToday).length;
  const totalTracked = openTasks + doneToday;
  const completionRatio =
    totalTracked > 0 ? Math.round((doneToday / totalTracked) * 100) : 0;

  const activeGoals = data.goalItems.filter((goal) =>
    itemMatchesMode(goal.lifeAreaName, mode),
  ).length;

  const metrics = [
    { label: "Open tasks", value: String(openTasks) },
    {
      label: "Completed today",
      value: totalTracked > 0 ? `${doneToday}/${totalTracked}` : String(doneToday),
    },
    { label: "Meetings today", value: String(todayEventCount) },
    { label: "Active goals", value: String(activeGoals) },
  ];

  return (
    <section className="cc2-glance-panel" aria-label="Today at a glance">
      <div className="cc2-glance-head">
        <span className="cc2-glance-eyebrow">Today at a Glance</span>
      </div>

      <ul className="cc2-glance-list">
        {metrics.map((metric) => (
          <li key={metric.label} className="cc2-glance-row">
            <span className="cc2-glance-label">{metric.label}</span>
            <span className="cc2-glance-value">{metric.value}</span>
          </li>
        ))}
      </ul>

      <div className="cc2-glance-chart" aria-hidden="true">
        <div className="cc2-glance-chart-bars">
          {Array.from({ length: CHART_SLOT_COUNT }, (_, index) => (
            <span
              key={index}
              className="cc2-glance-chart-bar"
              style={{
                height:
                  completionRatio > 0 && index === CHART_SLOT_COUNT - 1
                    ? `${Math.max(completionRatio, 12)}%`
                    : "8%",
              }}
            />
          ))}
        </div>
        <div className="cc2-glance-chart-axis">
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      </div>
    </section>
  );
}
