"use client";

import { useMemo } from "react";
import type { CommandCenterData } from "@/lib/jarvis/dashboard/load-command-center";
import { useJarvisWorkspace } from "@/components/jarvis/jarvis-workspace-provider";
import { CalendarPulse } from "./calendar-pulse";
import { CommandCenterStatusRail } from "./command-center-status-rail";
import { CommandKanban } from "./command-kanban";
import { GoalProgressPanel } from "./goal-progress-panel";
import { InboxPulse } from "./inbox-pulse";
import { ModeSwitcher } from "./mode-switcher";
import { PriorityStrip } from "./priority-strip";
import { TodayAtAGlance } from "./today-at-a-glance";
import { itemMatchesMode } from "@/lib/jarvis/dashboard/command-center-mode";

type CommandCenterDashboardProps = {
  data: CommandCenterData;
  displayName: string;
  greeting: string;
};

export function CommandCenterDashboard({
  data,
  displayName,
  greeting,
}: CommandCenterDashboardProps) {
  return (
    <CommandCenterDashboardInner
      data={data}
      displayName={displayName}
      greeting={greeting}
    />
  );
}

function CommandCenterDashboardInner({
  data,
  displayName,
  greeting,
}: CommandCenterDashboardProps) {
  const { workspace: mode } = useJarvisWorkspace();

  const todayEventCount = useMemo(() => {
    return data.outlook.events.filter((event) => {
      const eventDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: data.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(event.start));

      return eventDate === data.todayDate;
    }).length;
  }, [data.outlook.events, data.timezone, data.todayDate]);

  const openTaskCount = useMemo(() => {
    return data.kanbanTasks.filter(
      (task) =>
        itemMatchesMode(task.lifeAreaName, mode) && task.status !== "done",
    ).length;
  }, [data.kanbanTasks, mode]);

  return (
    <div className="cc2-main cc2-main--dashboard">
      <header className="cc2-header cc2-header--dashboard">
        <div className="cc2-header-row">
          <div className="cc2-header-main">
            <h1 className="cc2-greeting">
              {greeting},{" "}
              <span className="cc2-greeting-name">{displayName}</span>
            </h1>
            <p className="cc2-tagline">
              You&apos;ve got clarity. I&apos;ll handle the rest.
            </p>
          </div>
          <ModeSwitcher />
        </div>
      </header>

      <div className="cc2-dashboard-grid">
        <div className="cc2-dashboard-main">
          <PriorityStrip
            focusTask={data.focusTask}
            headerStatus={data.headerStatus}
          />

          <CommandKanban tasks={data.kanbanTasks} />

          <div className="cc2-lower-band">
            <div className="cc2-info-cluster">
              <GoalProgressPanel goals={data.goalItems} />
              <InboxPulse inbox={data.inbox} timeZone={data.timezone} />
              <CalendarPulse
                events={data.outlook.events}
                connected={data.outlook.connected}
                needsReconnect={data.outlook.needsReconnect}
                timeZone={data.timezone}
                todayDate={data.todayDate}
              />
            </div>
            <TodayAtAGlance
              data={data}
              todayEventCount={todayEventCount}
            />
          </div>
        </div>

        <CommandCenterStatusRail
          data={data}
          openTaskCount={openTaskCount}
          todayEventCount={todayEventCount}
        />
      </div>
    </div>
  );
}
