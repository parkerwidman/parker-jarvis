"use client";

import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { ModeSwitcher } from "@/components/jarvis/command-center/mode-switcher";
import {
  buildFilterCounts,
  filterGoalsForTab,
  findGoalById,
  resolveDefaultSelectedGoalId,
  resolveSelectedGoalId,
  type GoalsFilterTab,
} from "@/lib/jarvis/goals/goals-dashboard-state";
import {
  GOAL_PAGE_CONFIG,
  type GoalsPageData,
  type JarvisGoalType,
} from "@/lib/jarvis/goals/types";
import { useEffect, useMemo, useState } from "react";
import { GoalBuilder } from "./goal-builder";
import { GoalCompactCard } from "./goal-compact-card";
import { GoalDetailPanel } from "./goal-detail-panel";
import { GoalsFilterBar } from "./goals-filter-bar";

type GoalsDashboardProps = {
  data: GoalsPageData;
  goalType: JarvisGoalType;
};

export function GoalsDashboard({ data, goalType }: GoalsDashboardProps) {
  if (data.goalType !== goalType) {
    throw new Error("Goals page goal type mismatch.");
  }

  const config = GOAL_PAGE_CONFIG[data.goalType];
  const filterCounts = buildFilterCounts(data.counts);
  const [activeFilter, setActiveFilter] = useState<GoalsFilterTab>("all");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(() =>
    resolveDefaultSelectedGoalId(
      filterGoalsForTab(data.goals, "all", data.priorityGoalId),
      data.priorityGoalId,
      "all",
    ),
  );

  const filteredGoals = useMemo(
    () => filterGoalsForTab(data.goals, activeFilter, data.priorityGoalId),
    [activeFilter, data.goals, data.priorityGoalId],
  );

  const selectedGoal = findGoalById(data.goals, selectedGoalId);

  useEffect(() => {
    setActiveFilter("all");
    setSelectedGoalId(null);
  }, [data.domain, data.goalType]);

  useEffect(() => {
    setSelectedGoalId((current) =>
      resolveSelectedGoalId(current, filteredGoals, data.priorityGoalId, activeFilter),
    );
  }, [activeFilter, data.priorityGoalId, filteredGoals]);

  function handleFilterChange(nextFilter: GoalsFilterTab) {
    const nextFiltered = filterGoalsForTab(data.goals, nextFilter, data.priorityGoalId);

    setActiveFilter(nextFilter);
    setSelectedGoalId((current) =>
      resolveSelectedGoalId(current, nextFiltered, data.priorityGoalId, nextFilter),
    );
  }

  const hasAnyGoals = data.goals.length > 0;
  const showPriorityEmpty = activeFilter === "priority" && filteredGoals.length === 0;
  const showFilterEmpty = activeFilter !== "priority" && filteredGoals.length === 0 && hasAnyGoals;
  const showGlobalEmpty = !hasAnyGoals;

  return (
    <div className="gd2-dashboard">
      <JarvisPageHeader
        title={config.title}
        subtitle={config.subtitle}
        meta={<ModeSwitcher />}
      />

      <GoalsFilterBar
        activeFilter={activeFilter}
        counts={filterCounts}
        onFilterChange={handleFilterChange}
      />

      {showGlobalEmpty ? (
        <div className="gd2-empty-state">
          <p className="gd2-empty-title">{config.emptyDomainLabel(data.domain)}</p>
          <p className="gd2-empty-desc">
            Goals you add here will show up with roadmap levels and tasks.
          </p>
        </div>
      ) : (
        <>
          {filteredGoals.length > 0 ? (
            <div className="gd2-card-row-wrap">
              <div className="gd2-card-row" role="list" aria-label="Goals">
                {filteredGoals.map((goal) => (
                  <GoalCompactCard
                    key={goal.id}
                    goal={goal}
                    isSelected={goal.id === selectedGoalId}
                    onSelect={() => setSelectedGoalId(goal.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {showPriorityEmpty ? (
            <div className="gd2-empty-state gd2-empty-state--inline">
              <p className="gd2-empty-title">
                No Current Priority set for this workspace.
              </p>
              <p className="gd2-empty-desc">
                Select an active goal and set it as Current Priority, or switch to All Goals.
              </p>
            </div>
          ) : null}

          {showFilterEmpty ? (
            <div className="gd2-empty-state gd2-empty-state--inline">
              <p className="gd2-empty-title">No goals in this filter yet.</p>
            </div>
          ) : null}

          {selectedGoal ? (
            <GoalDetailPanel
              goal={selectedGoal}
              currentGoalType={data.goalType}
              showCurrentPriority={config.showCurrentPriority}
            />
          ) : filteredGoals.length === 0 ? null : (
            <div className="gd2-empty-state gd2-empty-state--inline">
              <p className="gd2-empty-title">Select a goal to view details.</p>
            </div>
          )}
        </>
      )}

      <GoalBuilder goalType={goalType} workspaceDomain={data.domain} />
    </div>
  );
}
