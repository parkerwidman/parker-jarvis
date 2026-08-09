"use client";

import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { filterGoalsByDomain } from "@/lib/jarvis/goals/goal-roadmap";
import {
  GOAL_PAGE_CONFIG,
  type GoalsPageData,
  type JarvisGoalType,
} from "@/lib/jarvis/goals/types";
import { GoalCard } from "./goal-card";
import { GoalsDomainProvider, useGoalsDomain } from "./goals-domain-provider";
import { GoalsDomainToggle } from "./goals-domain-toggle";

type GoalsPageInnerProps = {
  data: GoalsPageData;
};

function GoalsPageInner({ data }: GoalsPageInnerProps) {
  const config = GOAL_PAGE_CONFIG[data.goalType];
  const { domain } = useGoalsDomain();
  const visibleGoals = filterGoalsByDomain(data.goals, domain);
  const activeGoals = visibleGoals.filter((goal) => goal.status !== "completed");
  const completedGoals = visibleGoals.filter((goal) => goal.status === "completed");

  return (
    <>
      <JarvisPageHeader
        title={config.title}
        subtitle={config.subtitle}
        meta={<GoalsDomainToggle />}
      />

      {visibleGoals.length === 0 ? (
        <div className="goals-empty">
          <p className="goals-empty-title">{config.emptyDomainLabel(domain)}</p>
          <p className="goals-empty-desc">
            Goals you add here will show up with roadmap levels and tasks.
          </p>
        </div>
      ) : (
        <div className="goals-list">
          {activeGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              showTodayPriority={config.showTodayPriority}
            />
          ))}
          {completedGoals.length > 0 ? (
            <section className="goals-completed-section" aria-label="Completed goals">
              <h2 className="goals-completed-label">Completed</h2>
              {completedGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  showTodayPriority={config.showTodayPriority}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

type GoalsPageProps = {
  data: GoalsPageData;
  goalType: JarvisGoalType;
};

export function GoalsPage({ data, goalType }: GoalsPageProps) {
  if (data.goalType !== goalType) {
    throw new Error("Goals page goal type mismatch.");
  }

  return (
    <GoalsDomainProvider>
      <GoalsPageInner data={data} />
    </GoalsDomainProvider>
  );
}
