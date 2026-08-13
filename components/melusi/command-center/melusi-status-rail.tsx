import Link from "next/link";
import { MelusiBusinessHealthVisual } from "@/components/melusi/command-center/melusi-business-health-visual";
import {
  MelusiPipelineIcon,
  MelusiQuickActionIcon,
  MelusiTargetGraphic,
} from "@/components/melusi/melusi-icons";
import type { MelusiBusinessHealth } from "@/lib/jarvis/melusi/build-melusi-business-health";
import type { MelusiContentPipeline } from "@/lib/jarvis/melusi/build-melusi-content-pipeline";
import type { MelusiBusinessPriority } from "@/lib/jarvis/melusi/build-melusi-command-center-view";

type MelusiStatusRailProps = {
  businessHealth: MelusiBusinessHealth;
  businessPriority: MelusiBusinessPriority;
  contentPipeline: MelusiContentPipeline;
  pendingApprovalCount: number;
  createNextActionHref: string;
};

const QUICK_ACTIONS = [
  { id: "create", label: "Create Next Action", hrefKey: "create" as const },
  { id: "brief", label: "Morning Brief", href: "/briefings", hrefKey: "brief" as const },
  { id: "plan", label: "Daily Plan", href: "/plans", hrefKey: "plan" as const },
  { id: "approvals", label: "Approvals", href: "/approvals", hrefKey: "approvals" as const },
];

const PIPELINE_BAR_CLASS: Record<string, string> = {
  "active-projects": "melusi-pipeline-bar-fill--projects",
  "open-tasks": "melusi-pipeline-bar-fill--tasks",
  social: "melusi-pipeline-bar-fill--social",
};

function priorityTitle(priority: MelusiBusinessPriority): string {
  if (!priority) {
    return "No priority selected";
  }

  if (priority.kind === "project-planning") {
    return priority.projectName;
  }

  return priority.title;
}

function priorityNextAction(priority: MelusiBusinessPriority): string {
  if (!priority) {
    return "Add or prioritize a Melusi task.";
  }

  return priority.nextAction;
}

export function MelusiStatusRail({
  businessHealth,
  businessPriority,
  contentPipeline,
  pendingApprovalCount,
  createNextActionHref,
}: MelusiStatusRailProps) {
  return (
    <aside className="melusi-dash-rail" aria-label="Melusi status and quick actions">
      <section
        className="melusi-rail-card melusi-rail-card--health melusi-glass-surface melusi-glass-surface--accent"
        aria-label="Business health"
      >
        <p className="melusi-rail-eyebrow">Business Health</p>
        <MelusiBusinessHealthVisual state={businessHealth.state} />
        <p className={`melusi-health-headline melusi-health-headline--${businessHealth.state}`}>
          {businessHealth.headline}
        </p>
        <p className="melusi-health-summary">{businessHealth.summary}</p>
      </section>

      <section
        className="melusi-rail-card melusi-rail-card--priority melusi-glass-surface"
        aria-label="Active priority"
      >
        <p className="melusi-rail-eyebrow">Active Priority</p>
        <div className="melusi-rail-priority-layout">
          <div className="melusi-rail-priority-copy">
            <p className="melusi-rail-priority-title">{priorityTitle(businessPriority)}</p>
            <p className="melusi-rail-priority-next">
              <span>Next action:</span> {priorityNextAction(businessPriority)}
            </p>
          </div>
          <div className="melusi-rail-priority-target" aria-hidden="true">
            <MelusiTargetGraphic />
          </div>
        </div>
      </section>

      <section
        className="melusi-rail-card melusi-rail-card--actions melusi-glass-surface"
        aria-label="Quick actions"
      >
        <p className="melusi-rail-eyebrow">Quick Actions</p>
        <ul className="melusi-quick-actions">
          {QUICK_ACTIONS.map((action) => {
            const href =
              action.id === "create" ? createNextActionHref : action.href!;

            return (
              <li key={action.id}>
                <Link href={href} className="melusi-quick-action">
                  <span className="melusi-quick-action-icon-tile">
                    <MelusiQuickActionIcon name={action.hrefKey} />
                  </span>
                  <span className="melusi-quick-action-label">
                    {action.label}
                    {action.id === "approvals" && pendingApprovalCount > 0 ? (
                      <span className="melusi-quick-action-badge">
                        {pendingApprovalCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="melusi-quick-action-chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="melusi-rail-card melusi-rail-card--pipeline melusi-glass-surface"
        aria-label="Content pipeline"
      >
        <div className="melusi-pipeline-head">
          <span className="melusi-pipeline-head-icon" aria-hidden="true">
            <MelusiPipelineIcon />
          </span>
          <p className="melusi-rail-eyebrow melusi-rail-eyebrow--inline">Content Pipeline</p>
        </div>
        <ul className="melusi-pipeline-list">
          {contentPipeline.items.map((item) => {
            const barWidth =
              item.tracked && item.count !== null
                ? `${Math.max(4, Math.round((item.count / contentPipeline.maxCount) * 100))}%`
                : "0%";
            const barClass = PIPELINE_BAR_CLASS[item.id] ?? "";

            return (
              <li key={item.id} className="melusi-pipeline-item">
                <div className="melusi-pipeline-row">
                  <span className="melusi-pipeline-label">{item.label}</span>
                  <span className="melusi-pipeline-value">{item.value}</span>
                </div>
                <div className="melusi-pipeline-bar-track">
                  <div
                    className={`melusi-pipeline-bar-fill ${barClass}${item.tracked ? "" : " melusi-pipeline-bar-fill--untracked"}`}
                    style={{ width: item.tracked ? barWidth : "0%" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <Link href="/melusi#active-projects" className="melusi-pipeline-footer">
          View all projects
          <span aria-hidden="true">›</span>
        </Link>
      </section>
    </aside>
  );
}

export function resolveMelusiCreateNextActionHref(
  priority: MelusiBusinessPriority,
): string {
  if (priority?.kind === "project-planning") {
    return `/melusi/projects/${priority.projectId}`;
  }

  if (priority?.kind === "task" && priority.projectId) {
    return `/melusi/projects/${priority.projectId}`;
  }

  return "/melusi/threads";
}
