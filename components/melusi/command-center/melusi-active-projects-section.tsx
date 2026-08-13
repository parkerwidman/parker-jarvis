import Link from "next/link";
import { MelusiChevronIcon, MelusiProjectTileIcon } from "@/components/melusi/melusi-icons";
import { MelusiPanel } from "@/components/melusi/command-center/melusi-panel";
import type { MelusiActiveProject } from "@/lib/jarvis/melusi/build-melusi-command-center-view";
import { getMelusiProjectIconKind } from "@/lib/jarvis/melusi/melusi-project-visual";

export function MelusiActiveProjectsSection({
  projects,
}: {
  projects: MelusiActiveProject[];
}) {
  return (
    <MelusiPanel
      title="Active Projects"
      icon={<MelusiProjectTileIcon kind="generic" />}
      className="melusi-projects-panel"
    >
      {projects.length === 0 ? (
        <div className="melusi-empty-state melusi-empty-state--compact">
          <p className="melusi-empty-state-title">No active Melusi projects.</p>
          <p className="melusi-empty-state-copy">
            Create one through Melusi Jarvis or a project workspace.
          </p>
        </div>
      ) : (
        <ul className="melusi-active-projects" id="active-projects">
          {projects.map((project) => {
            const iconKind = getMelusiProjectIconKind(project.name);

            return (
              <li key={project.id} className="melusi-active-project">
                <div className="melusi-active-project-row">
                  <span
                    className={`melusi-project-tile melusi-project-tile--${iconKind}`}
                    aria-hidden="true"
                  >
                    <MelusiProjectTileIcon kind={iconKind} />
                  </span>
                  <div className="melusi-active-project-body">
                    <div className="melusi-active-project-header">
                      <Link
                        href={`/melusi/projects/${project.id}`}
                        className="melusi-active-project-link"
                      >
                        <span className="melusi-active-project-name">{project.name}</span>
                        <span className="melusi-active-project-chevron" aria-hidden="true">
                          <MelusiChevronIcon />
                        </span>
                      </Link>
                      <span className="melusi-active-project-status melusi-active-project-status--active">
                        {project.statusLabel}
                      </span>
                    </div>
                    <div className="melusi-active-project-meta">
                      <span>
                        {project.openTaskCount} open task
                        {project.openTaskCount === 1 ? "" : "s"}
                      </span>
                      {project.latestUpdateLabel ? (
                        <span>{project.latestUpdateLabel}</span>
                      ) : null}
                      {project.overdueTaskCount > 0 ? (
                        <span className="melusi-active-project-overdue">
                          {project.overdueTaskCount} overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="melusi-active-project-next">
                      <span>Next:</span>{" "}
                      {project.nextAction ?? "No next action assigned."}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MelusiPanel>
  );
}
