"use client";

import { JarvisButton } from "@/components/jarvis/jarvis-ui";
import { updateMelusiProjectStatus } from "@/app/melusi/actions";

const PROJECT_STATUSES = [
  "idea",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

function projectStatusLabel(status: string): string {
  switch (status) {
    case "idea":
      return "Idea";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

type MelusiProjectStatusFormProps = {
  projectId: string;
  projectName: string;
  currentStatus: string;
};

export function MelusiProjectStatusForm({
  projectId,
  projectName,
  currentStatus,
}: MelusiProjectStatusFormProps) {
  return (
    <form action={updateMelusiProjectStatus} className="la-project-status-form">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="la-status-select-label">
        <span className="la-sr-only">Update status for {projectName}</span>
        <select
          name="status"
          defaultValue={currentStatus}
          className="jv-input la-status-select"
          aria-label={`Status for ${projectName}`}
        >
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {projectStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <JarvisButton type="submit" variant="secondary">
        Update
      </JarvisButton>
    </form>
  );
}
