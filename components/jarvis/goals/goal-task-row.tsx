"use client";

import {
  deleteGoalTask,
  editGoalTaskTitle,
  setGoalTaskBlockState,
  setGoalTaskCompletion,
  setGoalTaskNotes,
} from "@/app/goals/actions";
import type { GoalTaskView, JarvisGoalStatus, LevelState } from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type GoalTaskRowProps = {
  task: GoalTaskView;
  levelState: LevelState;
  goalStatus: JarvisGoalStatus;
  levelTaskCount: number;
  levelStructuralPending?: boolean;
};

type EditorMode = "none" | "notes" | "block" | "title" | "deleteConfirm";

function statusLabel(status: GoalTaskView["status"]): string {
  switch (status) {
    case "done":
      return "Done";
    case "in_progress":
      return "In progress";
    default:
      return "To do";
  }
}

export function GoalTaskRow({
  task,
  levelState,
  goalStatus,
  levelTaskCount,
  levelStructuralPending = false,
}: GoalTaskRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [structuralError, setStructuralError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("none");
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  const [blockReasonDraft, setBlockReasonDraft] = useState(task.blockedReason ?? "");
  const [titleDraft, setTitleDraft] = useState(task.title);

  const isActiveGoal = goalStatus === "active";
  const canComplete = levelState === "current" && !task.isDone;
  const canReopen = task.isDone;
  const editorOpen = editorMode !== "none";
  const isInteractive =
    (canComplete || canReopen) && !isPending && !editorOpen;
  const canBlockNew = !task.isDone && !task.isBlocked;
  const canEditBlocker = task.isBlocked;
  const canUnblock = task.isBlocked;
  const metadataDisabled = isPending || editorOpen || levelStructuralPending;
  const structuralDisabled = metadataDisabled;
  const canEditTitle = true;
  const canDelete = isActiveGoal && levelTaskCount > 1;

  function closeEditor() {
    setEditorMode("none");
    setNoteDraft(task.notes ?? "");
    setBlockReasonDraft(task.blockedReason ?? "");
    setTitleDraft(task.title);
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

  return (
    <li
      className={`goals-task-row${
        task.isDone ? " goals-task-row--done" : ""
      }${task.isActionable ? " goals-task-row--actionable" : ""}${
        task.isBlocked ? " goals-task-row--blocked" : ""
      }`}
    >
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
      <div className="goals-task-body">
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
          <div className="goals-task-title-row">
            <span className="goals-task-title">{task.title}</span>
            {task.isBlocked ? (
              <span className="goals-task-badge goals-task-badge--blocked">Blocked</span>
            ) : null}
          </div>
        )}
        <div className="goals-task-meta">
          <span className="goals-task-status">{statusLabel(task.status)}</span>
        </div>
        {task.isBlocked && task.blockedReason ? (
          <p className="goals-task-blocked-reason">{task.blockedReason}</p>
        ) : null}
        {task.notes ? <p className="goals-task-notes-text">{task.notes}</p> : null}
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
        {editorMode === "none" ? (
          <div className="goals-task-actions">
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
            <button
              type="button"
              className="goals-task-action"
              disabled={metadataDisabled}
              onClick={() => {
                setMetadataError(null);
                setNoteDraft(task.notes ?? "");
                setEditorMode("notes");
              }}
            >
              {task.notes ? "Edit note" : "Add note"}
            </button>
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
          </div>
        ) : null}
        {completionError ? <p className="goals-task-error">{completionError}</p> : null}
        {metadataError ? <p className="goals-task-error">{metadataError}</p> : null}
        {structuralError ? <p className="goals-task-error">{structuralError}</p> : null}
      </div>
    </li>
  );
}
