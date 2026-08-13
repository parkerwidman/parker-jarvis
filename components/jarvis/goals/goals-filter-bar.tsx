"use client";

import type { GoalsFilterCounts, GoalsFilterTab } from "@/lib/jarvis/goals/goals-dashboard-state";

type GoalsFilterBarProps = {
  activeFilter: GoalsFilterTab;
  counts: GoalsFilterCounts;
  onFilterChange: (filter: GoalsFilterTab) => void;
};

const FILTER_TABS: Array<{ id: GoalsFilterTab; label: string }> = [
  { id: "all", label: "All Goals" },
  { id: "priority", label: "Current Priority" },
  { id: "completed", label: "Completed" },
];

export function GoalsFilterBar({
  activeFilter,
  counts,
  onFilterChange,
}: GoalsFilterBarProps) {
  return (
    <div className="gd2-filter-bar" role="tablist" aria-label="Goal filters">
      {FILTER_TABS.map((tab) => {
        const count = counts[tab.id];
        const isActive = activeFilter === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`gd2-filter-tab${isActive ? " gd2-filter-tab--active" : ""}`}
            onClick={() => onFilterChange(tab.id)}
          >
            <span>{tab.label}</span>
            <span className="gd2-filter-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
