"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { ScheduleLegend } from "@/components/schedule/schedule-legend";
import { SchedulePeriodSelector } from "@/components/schedule/schedule-period-selector";
import { ScheduleWeekGrid } from "@/components/schedule/schedule-week-grid";
import { ScheduleWeekNav } from "@/components/schedule/schedule-week-nav";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";
import { addDaysToLocalDate } from "@/lib/jarvis/schedule/schedule-datetime";
import {
  buildScheduleHref,
  getMondayWeekStart,
  type ScheduleWeekViewModel,
} from "@/lib/jarvis/schedule/schedule-week-view";

export type ScheduleDashboardProps = {
  schedules: JarvisSchedule[];
  selectedScheduleId: string;
  todayLocal: string;
  viewModel: ScheduleWeekViewModel;
};

export function ScheduleDashboard({
  schedules,
  selectedScheduleId,
  todayLocal,
  viewModel,
}: ScheduleDashboardProps) {
  const router = useRouter();

  const navigate = useCallback(
    (weekStart: string, scheduleId: string) => {
      router.push(buildScheduleHref(weekStart, scheduleId));
    },
    [router],
  );

  const handlePreviousWeek = () => {
    navigate(addDaysToLocalDate(viewModel.weekStart, -7), selectedScheduleId);
  };

  const handleNextWeek = () => {
    navigate(addDaysToLocalDate(viewModel.weekStart, 7), selectedScheduleId);
  };

  const handleToday = () => {
    navigate(getMondayWeekStart(todayLocal), selectedScheduleId);
  };

  const handleSelectSchedule = (scheduleId: string) => {
    navigate(viewModel.weekStart, scheduleId);
  };

  return (
    <JarvisPageContent className="jv-page-content--scroll schedule-page-content">
      <JarvisPageHeader
        title="Weekly Plan"
        subtitle="Your structured weekly schedule"
        meta={
          <ScheduleWeekNav
            weekLabel={viewModel.weekLabel}
            onPrevious={handlePreviousWeek}
            onNext={handleNextWeek}
            onToday={handleToday}
          />
        }
      />

      <div className="schedule-dashboard">
        <SchedulePeriodSelector
          schedules={schedules}
          selectedScheduleId={selectedScheduleId}
          onSelectSchedule={handleSelectSchedule}
        />

        <ScheduleLegend categories={viewModel.usedCategories} />

        {!viewModel.intersectsSchedule ? (
          <JarvisEmptyState
            title="No scheduled blocks for this week"
            description="This week falls outside the selected schedule period. Navigate to a week within the schedule range to view your blocks."
          />
        ) : null}

        <div className="schedule-surface">
          <ScheduleWeekGrid viewModel={viewModel} />
        </div>
      </div>
    </JarvisPageContent>
  );
}
