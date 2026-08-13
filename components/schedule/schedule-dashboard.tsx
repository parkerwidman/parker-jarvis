"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { ScheduleEditor } from "@/components/schedule/schedule-editor";
import { ScheduleLegend } from "@/components/schedule/schedule-legend";
import { SchedulePeriodSelector } from "@/components/schedule/schedule-period-selector";
import { ScheduleWeekGrid } from "@/components/schedule/schedule-week-grid";
import { ScheduleWeekNav } from "@/components/schedule/schedule-week-nav";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import type { ScheduleBlockEditContext } from "@/lib/jarvis/schedule/schedule-mutation-types";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";
import { addDaysToLocalDate } from "@/lib/jarvis/schedule/schedule-datetime";
import {
  blockToEditContext,
  buildScheduleHref,
  getMondayWeekStart,
  type ScheduleBlockViewModel,
  type ScheduleWeekViewModel,
} from "@/lib/jarvis/schedule/schedule-week-view";

export type ScheduleDashboardProps = {
  schedules: JarvisSchedule[];
  selectedSchedule: JarvisSchedule;
  selectedScheduleId: string;
  todayLocal: string;
  viewModel: ScheduleWeekViewModel;
};

export function ScheduleDashboard({
  schedules,
  selectedSchedule,
  selectedScheduleId,
  todayLocal,
  viewModel,
}: ScheduleDashboardProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("edit");
  const [editContext, setEditContext] = useState<ScheduleBlockEditContext | null>(
    null,
  );

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

  const handleBlockSelect = (block: ScheduleBlockViewModel) => {
    setEditorMode("edit");
    setEditContext(blockToEditContext(block));
    setEditorOpen(true);
  };

  const handleAddBlock = () => {
    setEditorMode("create");
    setEditContext(null);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditContext(null);
  };

  const defaultEditorDate =
    viewModel.days.find((day) => day.isToday)?.date ?? viewModel.weekStart;

  return (
    <>
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
          <div className="schedule-dashboard-toolbar">
            <SchedulePeriodSelector
              schedules={schedules}
              selectedScheduleId={selectedScheduleId}
              onSelectSchedule={handleSelectSchedule}
            />
            <button
              type="button"
              className="schedule-add-block-button"
              onClick={handleAddBlock}
            >
              + Add Block
            </button>
          </div>

          <ScheduleLegend categories={viewModel.usedCategories} />

          {!viewModel.intersectsSchedule ? (
            <JarvisEmptyState
              title="No scheduled blocks for this week"
              description="This week falls outside the selected schedule period. Navigate to a week within the schedule range to view your blocks."
            />
          ) : null}

          <div className="schedule-surface">
            <ScheduleWeekGrid
              viewModel={viewModel}
              onBlockSelect={handleBlockSelect}
            />
          </div>
        </div>
      </JarvisPageContent>

      <ScheduleEditor
        open={editorOpen}
        mode={editorMode}
        schedule={selectedSchedule}
        context={editContext}
        defaultDate={defaultEditorDate}
        onClose={handleCloseEditor}
      />
    </>
  );
}
