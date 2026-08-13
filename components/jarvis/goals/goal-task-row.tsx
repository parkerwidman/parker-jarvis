"use client";

import {
  deleteGoalTask,
  editGoalTaskTitle,
  moveGoalTask,
  setGoalTaskBlockState,
  setGoalTaskCompletion,
  setGoalTaskDueAt,
  setGoalTaskNotes,
} from "@/app/goals/actions";
import {
  dueAtToDateInputValue,
  formatTaskDueDateLabel,
} from "@/lib/jarvis/goals/goal-dates";
import type { GoalTaskView, JarvisGoalStatus, LevelState } from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type GoalTaskRowProps = {
  task: GoalTaskView;
  levelState: LevelState;
  goalStatus: JarvisGoalStatus;
  levelTaskCount: number;
  taskIndex?: number;
  levelStructuralPending?: boolean;
  isEditing?: boolean;
  variant?: "default" | "timeline";
};

type EditorMode = "none" | "notes" | "block" | "title" | "dueDate" | "deleteConfirm";

function statusLabel(status: GoalTaskView["status"], variant: "default" | "timeline"): string {
  if (variant === "timeline") {
    switch (status) {
      case "done":
        return "COMPLETE";
      case "in_progress":
        return "CURRENT";
      default:
        return levelStateToChip(levelStateFromStatus(status));
    }
  }

  switch (status) {
    case "done":
      return "Done";
    case "in_progress":
      return "In progress";
    default:
      return "To do";
  }
}

function levelStateFromStatus(status: GoalTaskView["status"]): string {
  return status === "done" ? "complete" : "pending";
}

function levelStateToChip(state: string): string {
  return state === "complete" ? "COMPLETE" : "PENDING";
}

function timelineTaskStatus(task: GoalTaskView, levelState: LevelState): string {
  if (task.isDone) {
    return "COMPLETE";
  }

  if (levelState === "current" && task.isActionable) {
    return "CURRENT";
  }

  if (levelState === "locked") {
    return "PENDING";
  }

  return levelState === "current" ? "CURRENT" : "PENDING";
}

export function GoalTaskRow({
  task,
  levelState,
  goalStatus,
  levelTaskCount,
  taskIndex = 0,
  levelStructuralPending = false,
  isEditing = false,
  variant = "default",
}: GoalTaskRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [structuralError, setStructuralError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("none");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  const [blockReasonDraft, setBlockReasonDraft] = useState(task.blockedReason ?? "");
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [dueDateDraft, setDueDateDraft] = useState(dueAtToDateInputValue(task.dueAt));
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const isActiveGoal = goalStatus === "active";
  const canMoveTasks = isActiveGoal;
  const isFirstTask = taskIndex === 0;
  const isLastTask = taskIndex === levelTaskCount - 1;
  const canComplete = levelState === "current" && !task.isDone;
  const canReopen = task.isDone;
  const editorOpen = editorMode !== "none";
  const isInteractive =
    (canComplete || canReopen) && !isPending && !editorOpen;
  const canBlockNew = !task.isDone && !task.isBlocked;
  const canEditBlocker = task.isBlocked;
  const canUnblock = task.isBlocked;
  const metadataDisabled = isPending || editorOpen || levelStructuralPending || isMoving;
  const structuralDisabled = metadataDisabled;
  const canEditTitle = true;
  const canDelete = isActiveGoal && levelTaskCount > 1;
  const showStructuralControls = isEditing;
  const dueLabel = formatTaskDueDateLabel(task.dueAt);
  const isTimeline = variant === "timeline";

  function closeStructuralEditor() {
    if (
      editorMode === "title" ||
      editorMode === "deleteConfirm" ||
      editorMode === "block" ||
      editorMode === "dueDate"
    ) {
      setEditorMode("none");
      setBlockReasonDraft(task.blockedReason ?? "");
      setTitleDraft(task.title);
      setDueDateDraft(dueAtToDateInputValue(task.dueAt));
      setStructuralError(null);
      setMetadataError(null);
    }
  }

  useEffect(() => {
    if (!isEditing) {
      closeStructuralEditor();
      setMoveError(null);
      setIsMoving(false);
    }
  }, [isEditing]);

  function closeEditor() {
    setEditorMode("none");
    setNoteDraft(task.notes ?? "");
    setBlockReasonDraft(task.blockedReason ?? "");
    setTitleDraft(task.title);
    setDueDateDraft(dueAtToDateInputValue(task.dueAt));
    setMetadataError(null);
    setStructuralError(null);
  }

  function refreshAfterMetadataMutation() {
    closeEditor();
    router.refresh();
  }

  async function handleToggle() {
    if (!isInteractive) {
      return;
    }

    setCompletionError(null);

    startTransition(async () => {
      const result = await setGoalTaskCompletion(task.id, !task.isDone);

      if (!result.ok) {
        setCompletionError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleSaveNotes() {
    setMetadataError(null);

    startTransition(async () => {
      const result = await setGoalTaskNotes(task.id, noteDraft);

      if (!result.ok) {
        setMetadataError(result.error);
        return;
      }

      refreshAfterMetadataMutation();
    });
  }

  function handleSaveDueDate(clearDueDate = false) {
    setStructuralError(null);

    startTransition(async () => {
      const result = await setGoalTaskDueAt(
        task.id,
        clearDueDate ? null : dueDateDraft || null,
        clearDueDate,
      );

      if (!result.ok) {
        setStructuralError(result.error);
        return;
      }

      closeEditor();
      router.refresh();
    });
  }

  function handleBlockTask() {
    setMetadataError(null);

    startTransition(async () => {
      const result = await setGoalTaskBlockState(task.id, true, blockReasonDraft);

      if (!result.ok) {
        setMetadataError(result.error);
        return;
      }

      refreshAfterMetadataMutation();
    });
  }

  function handleUnblockTask() {
    setMetadataError(null);

    startTransition(async () => {
      const result = await setGoalTaskBlockState(task.id, false, null);

      if (!result.ok) {
        setMetadataError(result.error);
        return;
      }

      refreshAfterMetadataMutation();
    });
  }

  function handleSaveTitle() {
    setStructuralError(null);

    startTransition(async () => {
      const result = await editGoalTaskTitle(task.id, titleDraft);

      if (!result.ok) {
        setStructuralError(result.error);
        return;
      }

      closeEditor();
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    setStructuralError(null);

    startTransition(async () => {
      const result = await deleteGoalTask(task.id);

      if (!result.ok) {
        setStructuralError(result.error);
        return;
      }

      closeEditor();
      router.refresh();
    });
  }

  function handleMoveTask(direction: "up" | "down") {
    setMoveError(null);
    setIsMoving(true);

    startTransition(async () => {
      const result = await moveGoalTask(task.id, direction);

      setIsMoving(false);

      if (!result.ok) {
        setMoveError(result.error);
        return;
      }

      router.refresh();
    });
  }

  const rowClassName = isTimeline
    ? `gd2-task-row gd2-task-row--${task.isDone ? "complete" : levelState}${
        task.isBlocked ? " gd2-task-row--blocked" : ""
      }`
    : `goals-task-row${task.isDone ? " goals-task-row--done" : ""}${
        task.isActionable ? " goals-task-row--actionable" : ""
      }${task.isBlocked ? " goals-task-row--blocked" : ""}`;

  const chipLabel = isTimeline
    ? timelineTaskStatus(task, levelState)
    : statusLabel(task.status, variant);

  return (
    <li className={rowClassName}>
      {!isTimeline ? (
        <button
          type="button"
          className={`goals-task-check${
            task.isDone ? " goals-task-check--done" : ""
          }${task.isActionable ? " goals-task-check--current" : ""}${
            isInteractive ? " goals-task-check--interactive" : ""
          }`}
          aria-label={
            task.isDone
              ? `Reopen ${task.title}`
              : canComplete
                ? `Complete ${task.title}`
                : `${task.title} locked until earlier levels finish`
          }
          aria-pressed={task.isDone}
          disabled={!isInteractive}
          onClick={handleToggle}
        />
      ) : (
        <div className="gd2-task-marker" aria-hidden="true">
          <span className={`gd2-task-dot gd2-task-dot--${chipLabel.toLowerCase()}`} />
        </div>
      )}

      <div className={isTimeline ? "gd2-task-body" : "goals-task-body"}>
        {editorMode === "title" ? (
          <div className="goals-task-editor">
            <input
              type="text"
              className="goals-task-input"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              disabled={isPending}
              placeholder="Task title"
            />
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--primary"
                disabled={isPending}
                onClick={handleSaveTitle}
              >
                Save
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={isTimeline ? "gd2-task-title-row" : "goals-task-title-row"}>
            <span className={isTimeline ? "gd2-task-title" : "goals-task-title"}>
              {task.title}
            </span>
            {task.isBlocked ? (
              <span className="goals-task-badge goals-task-badge--blocked">Blocked</span>
            ) : null}
            {isTimeline ? (
              <span className={`gd2-task-chip gd2-task-chip--${chipLabel.toLowerCase()}`}>
                {chipLabel}
              </span>
            ) : null}
          </div>
        )}

        {!isTimeline ? (
          <div className="goals-task-meta">
            <span className="goals-task-status">{chipLabel}</span>
          </div>
        ) : null}

        {dueLabel ? (
          <p className={isTimeline ? "gd2-task-due" : "goals-task-due"}>Due {dueLabel}</p>
        ) : null}

        {task.isBlocked && task.blockedReason ? (
          <p className="goals-task-blocked-reason">{task.blockedReason}</p>
        ) : null}

        {(isTimeline ? detailsOpen : true) && task.notes ? (
          <p className={isTimeline ? "gd2-task-notes" : "goals-task-notes-text"}>{task.notes}</p>
        ) : null}

        {editorMode === "notes" ? (
          <div className="goals-task-editor">
            <textarea
              className="goals-task-textarea"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={3}
              disabled={isPending}
              placeholder="Add a note for this task"
            />
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--primary"
                disabled={isPending}
                onClick={handleSaveNotes}
              >
                Save
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {editorMode === "dueDate" ? (
          <div className="goals-task-editor">
            <label className="goals-settings-label">
              Due date <span className="goals-builder-optional">optional</span>
            </label>
            <input
              type="date"
              className="goals-task-input"
              value={dueDateDraft}
              onChange={(event) => setDueDateDraft(event.target.value)}
              disabled={isPending}
            />
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--primary"
                disabled={isPending}
                onClick={() => handleSaveDueDate(false)}
              >
                Save
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={() => handleSaveDueDate(true)}
              >
                Clear date
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {editorMode === "block" ? (
          <div className="goals-task-editor">
            <textarea
              className="goals-task-textarea"
              value={blockReasonDraft}
              onChange={(event) => setBlockReasonDraft(event.target.value)}
              rows={2}
              disabled={isPending}
              placeholder="Why is this task blocked?"
            />
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--primary"
                disabled={isPending}
                onClick={handleBlockTask}
              >
                {task.isBlocked ? "Save blocker" : "Block task"}
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {editorMode === "deleteConfirm" ? (
          <div className="goals-task-editor">
            <p className="goals-task-delete-prompt">Delete this task?</p>
            <div className="goals-task-editor-actions">
              <button
                type="button"
                className="goals-task-action goals-task-action--danger"
                disabled={isPending}
                onClick={handleConfirmDelete}
              >
                Confirm
              </button>
              <button
                type="button"
                className="goals-task-action"
                disabled={isPending}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {editorMode === "none" || editorMode === "notes" || editorMode === "dueDate" ? (
          <div className={isTimeline ? "gd2-task-actions" : "goals-task-actions"}>
            {isTimeline && !isEditing ? (
              <>
                <button
                  type="button"
                  className="gd2-task-action"
                  onClick={() => setDetailsOpen((value) => !value)}
                >
                  {detailsOpen ? "Hide details" : "View details"}
                </button>
                {canComplete || canReopen ? (
                  <button
                    type="button"
                    className="gd2-task-action"
                    disabled={!isInteractive}
                    onClick={handleToggle}
                  >
                    {task.isDone ? "Reopen" : "Complete"}
                  </button>
                ) : null}
              </>
            ) : null}

            {editorMode === "none" && (isEditing || !isTimeline) ? (
              <button
                type="button"
                className="goals-task-action goals-task-action--subtle"
                disabled={metadataDisabled}
                onClick={() => {
                  setMetadataError(null);
                  setNoteDraft(task.notes ?? "");
                  setEditorMode("notes");
                }}
              >
                {task.notes ? "Edit note" : "Add note"}
              </button>
            ) : null}

            {showStructuralControls ? (
              <>
                {canMoveTasks ? (
                  <>
                    <button
                      type="button"
                      className="goals-task-action"
                      disabled={structuralDisabled || isFirstTask}
                      aria-label={`Move ${task.title} up`}
                      onClick={() => handleMoveTask("up")}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="goals-task-action"
                      disabled={structuralDisabled || isLastTask}
                      aria-label={`Move ${task.title} down`}
                      onClick={() => handleMoveTask("down")}
                    >
                      Move down
                    </button>
                  </>
                ) : null}
                {canEditTitle ? (
                  <button
                    type="button"
                    className="goals-task-action"
                    disabled={structuralDisabled}
                    onClick={() => {
                      setStructuralError(null);
                      setTitleDraft(task.title);
                      setEditorMode("title");
                    }}
                  >
                    Edit task
                  </button>
                ) : null}
                <button
                  type="button"
                  className="goals-task-action"
                  disabled={structuralDisabled}
                  onClick={() => {
                    setStructuralError(null);
                    setDueDateDraft(dueAtToDateInputValue(task.dueAt));
                    setEditorMode("dueDate");
                  }}
                >
                  {task.dueAt ? "Edit due date" : "Add due date"}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="goals-task-action goals-task-action--danger"
                    disabled={structuralDisabled}
                    onClick={() => {
                      setStructuralError(null);
                      setEditorMode("deleteConfirm");
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                {canBlockNew ? (
                  <button
                    type="button"
                    className="goals-task-action"
                    disabled={metadataDisabled}
                    onClick={() => {
                      setMetadataError(null);
                      setBlockReasonDraft("");
                      setEditorMode("block");
                    }}
                  >
                    Block
                  </button>
                ) : null}
                {canEditBlocker ? (
                  <button
                    type="button"
                    className="goals-task-action"
                    disabled={metadataDisabled}
                    onClick={() => {
                      setMetadataError(null);
                      setBlockReasonDraft(task.blockedReason ?? "");
                      setEditorMode("block");
                    }}
                  >
                    Edit blocker
                  </button>
                ) : null}
                {canUnblock ? (
                  <button
                    type="button"
                    className="goals-task-action"
                    disabled={metadataDisabled}
                    onClick={handleUnblockTask}
                  >
                    Unblock
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {completionError ? <p className="goals-task-error">{completionError}</p> : null}
        {metadataError ? <p className="goals-task-error">{metadataError}</p> : null}
        {structuralError ? <p className="goals-task-error">{structuralError}</p> : null}
        {moveError ? <p className="goals-task-error">{moveError}</p> : null}
      </div>
    </li>
  );
}
