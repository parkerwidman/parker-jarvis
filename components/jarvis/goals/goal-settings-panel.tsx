"use client";

import { archiveGoal, updateGoalMetadata } from "@/app/goals/actions";
import {
  GOAL_PAGE_CONFIG,
  domainLabel,
  type JarvisGoalDomain,
  type JarvisGoalType,
} from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type GoalSettingsPanelProps = {
  goalId: string;
  title: string;
  domain: JarvisGoalDomain;
  currentGoalType: JarvisGoalType;
  isEditing: boolean;
};

const HORIZON_OPTIONS: { value: JarvisGoalType; label: string }[] = [
  { value: "short_term", label: "Short Term" },
  { value: "three_month", label: "3 Month" },
  { value: "long_term", label: "Long Term" },
];

function horizonPageLabel(goalType: JarvisGoalType): string {
  return GOAL_PAGE_CONFIG[goalType].title;
}

export function GoalSettingsPanel({
  goalId,
  title,
  domain,
  currentGoalType,
  isEditing,
}: GoalSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState(title);
  const [domainDraft, setDomainDraft] = useState(domain);
  const [goalTypeDraft, setGoalTypeDraft] = useState(currentGoalType);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      setTitleDraft(title);
      setDomainDraft(domain);
      setGoalTypeDraft(currentGoalType);
      setMetadataError(null);
      setArchiveConfirmOpen(false);
      setArchiveError(null);
    }
  }, [isEditing, title, domain, currentGoalType]);

  const trimmedTitle = titleDraft.trim();
  const titleInvalid = trimmedTitle.length < 1 || trimmedTitle.length > 200;

  const hasMetadataChanges = useMemo(() => {
    return (
      trimmedTitle !== title ||
      domainDraft !== domain ||
      goalTypeDraft !== currentGoalType
    );
  }, [trimmedTitle, title, domainDraft, domain, goalTypeDraft, currentGoalType]);

  const horizonChanged = goalTypeDraft !== currentGoalType;

  function handleCancelMetadata() {
    setTitleDraft(title);
    setDomainDraft(domain);
    setGoalTypeDraft(currentGoalType);
    setMetadataError(null);
  }

  function handleSaveMetadata() {
    if (!hasMetadataChanges || titleInvalid) {
      return;
    }

    setMetadataError(null);

    const input: {
      title?: string;
      domain?: JarvisGoalDomain;
      goalType?: JarvisGoalType;
    } = {};

    if (trimmedTitle !== title) {
      input.title = trimmedTitle;
    }

    if (domainDraft !== domain) {
      input.domain = domainDraft;
    }

    if (goalTypeDraft !== currentGoalType) {
      input.goalType = goalTypeDraft;
    }

    startTransition(async () => {
      const result = await updateGoalMetadata(goalId, input);

      if (!result.ok) {
        setMetadataError(result.error);
        return;
      }

      if (goalTypeDraft !== currentGoalType) {
        router.push(GOAL_PAGE_CONFIG[goalTypeDraft].route);
        return;
      }

      router.refresh();
    });
  }

  function handleArchiveConfirm() {
    setArchiveError(null);

    startTransition(async () => {
      const result = await archiveGoal(goalId);

      if (!result.ok) {
        setArchiveError(result.error);
        return;
      }

      setArchiveConfirmOpen(false);
      router.refresh();
    });
  }

  if (!isEditing) {
    return null;
  }

  return (
    <section className="goals-settings" aria-label="Goal settings">
      <p className="goals-settings-heading">Goal settings</p>

      <div className="goals-settings-fields">
        <label className="goals-settings-field">
          <span className="goals-settings-label">Title</span>
          <input
            type="text"
            className="goals-task-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            disabled={isPending}
            maxLength={200}
          />
        </label>

        <fieldset className="goals-settings-field">
          <legend className="goals-settings-label">Domain</legend>
          <div className="goals-domain-seg goals-settings-domain-seg" role="group">
            {(["personal", "melusi"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`goals-domain-seg-btn goals-domain-seg-btn--${option}${
                  domainDraft === option ? " goals-domain-seg-btn--active" : ""
                }`}
                disabled={isPending}
                aria-pressed={domainDraft === option}
                onClick={() => setDomainDraft(option)}
              >
                {domainLabel(option)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="goals-settings-field">
          <span className="goals-settings-label">Horizon</span>
          <select
            className="goals-settings-select"
            value={goalTypeDraft}
            disabled={isPending}
            onChange={(event) => setGoalTypeDraft(event.target.value as JarvisGoalType)}
          >
            {HORIZON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {horizonChanged ? (
            <p className="goals-settings-hint">
              Moves this goal to {horizonPageLabel(goalTypeDraft)}.
            </p>
          ) : null}
        </label>
      </div>

      {titleInvalid && hasMetadataChanges ? (
        <p className="goals-task-error">Goal title must be between 1 and 200 characters.</p>
      ) : null}
      {metadataError ? <p className="goals-task-error">{metadataError}</p> : null}

      {hasMetadataChanges ? (
        <div className="goals-task-editor-actions goals-settings-actions">
          <button
            type="button"
            className="goals-task-action goals-task-action--primary"
            disabled={isPending || titleInvalid}
            onClick={handleSaveMetadata}
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="goals-task-action"
            disabled={isPending}
            onClick={handleCancelMetadata}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="goals-settings-archive">
        {archiveConfirmOpen ? (
          <div className="goals-settings-archive-confirm">
            <p className="goals-settings-archive-copy">
              This removes the goal and its tasks from your active Jarvis planning. Your goal
              history is preserved.
            </p>
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--danger"
                disabled={isPending}
                onClick={handleArchiveConfirm}
              >
                {isPending ? "Archiving…" : "Archive goal"}
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={() => {
                  setArchiveConfirmOpen(false);
                  setArchiveError(null);
                }}
              >
                Cancel
              </button>
            </div>
            {archiveError ? <p className="goals-task-error">{archiveError}</p> : null}
          </div>
        ) : (
          <button
            type="button"
            className="goals-task-action goals-task-action--danger"
            disabled={isPending}
            onClick={() => {
              setArchiveError(null);
              setArchiveConfirmOpen(true);
            }}
          >
            Archive goal
          </button>
        )}
      </div>
    </section>
  );
}
