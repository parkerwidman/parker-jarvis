import type { ReactNode } from "react";
import { MelusiActiveProjectsSection } from "@/components/melusi/command-center/melusi-active-projects-section";
import { MelusiNeedsAttentionSection } from "@/components/melusi/command-center/melusi-needs-attention-section";
import {
  MelusiBusinessPrioritySection,
  MelusiCommandCenterHeader,
  MelusiTasksSection,
} from "@/components/melusi/command-center/melusi-priority-section";
import { MelusiBusinessSnapshotStrip } from "@/components/melusi/command-center/melusi-snapshot-section";
import {
  MelusiStatusRail,
  resolveMelusiCreateNextActionHref,
} from "@/components/melusi/command-center/melusi-status-rail";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import type { MelusiCommandCenterData } from "@/lib/jarvis/melusi/load-melusi-command-center";

type MelusiCommandCenterDashboardProps = {
  data: MelusiCommandCenterData;
  jarvisPanel: ReactNode;
};

export function MelusiCommandCenterDashboard({
  data,
  jarvisPanel,
}: MelusiCommandCenterDashboardProps) {
  return (
    <div className="melusi-dash-grid">
      <div className="melusi-dash-main">
        <MelusiCommandCenterHeader
          businessPriority={data.businessPriority}
          businessContextLine={data.businessContextLine}
        />

        <MelusiNav />

        <MelusiBusinessPrioritySection
          priority={data.businessPriority}
          timeZone={data.timezone}
        />

        <div className="melusi-operating-grid">
          <MelusiTasksSection taskGroups={data.taskGroups} timeZone={data.timezone} />
          <MelusiActiveProjectsSection projects={data.activeProjects} />
        </div>

        <MelusiBusinessSnapshotStrip items={data.kpiItems} />

        <MelusiNeedsAttentionSection items={data.attentionItems} />

        <div className="melusi-jarvis-shell">{jarvisPanel}</div>
      </div>

      <MelusiStatusRail
        businessHealth={data.businessHealth}
        businessPriority={data.businessPriority}
        contentPipeline={data.contentPipeline}
        pendingApprovalCount={data.pendingApprovalCount}
        createNextActionHref={resolveMelusiCreateNextActionHref(data.businessPriority)}
      />
    </div>
  );
}
