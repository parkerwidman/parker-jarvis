import Link from "next/link";
import { CommandCenterPanel } from "@/components/jarvis/command-center/command-center-panel";
import type { MelusiActiveProject } from "@/lib/jarvis/melusi/build-melusi-command-center-view";

export function MelusiActiveProjectsSection({
  projects,
}: {
  projects: MelusiActiveProject[];
}) {
  return (
    <CommandCenterPanel
      title="Active Projects"
      className="melusi-projects-panel"
    >
      {projects.length === 0 ? (
        <p className="cc-empty cc-empty--compact">
          No active Melusi projects. Create one through Melusi Jarvis or a project
          workspace.
        </p>
      ) : (
        <ul className="melusi-active-projects" id="active-projects">
          {projects.map((project) => (
            <li key={project.id} className="melusi-active-project">
              <div className="melusi-active-project-header">
                <Link
                  href={`/melusi/projects/${project.id}`}
                  className="melusi-active-project-name"
                >
                  {project.name}
                </Link>
                <span className="melusi-active-project-status">
                  {project.statusLabel}
                </span>
              </div>
              <div className="melusi-active-project-meta">
                <span>
                  {project.openTaskCount} open task
                  {project.openTaskCount === 1 ? "" : "s"}
                </span>
                {project.overdueTaskCount > 0 ? (
                  <span className="melusi-active-project-overdue">
                    {project.overdueTaskCount} overdue
                  </span>
                ) : null}
                {project.latestUpdateLabel ? (
                  <span>{project.latestUpdateLabel}</span>
                ) : null}
              </div>
              <p className="melusi-active-project-next">
                <span>Next:</span>{" "}
                {project.nextAction ?? "No next action assigned."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </CommandCenterPanel>
  );
}
