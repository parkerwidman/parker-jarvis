"use client";

import {
  addGoalLevel,
  addGoalTask,
  deleteGoalLevel,
  editGoalLevelName,
  moveGoalLevel,
} from "@/app/goals/actions";
import type { GoalLevelView, JarvisGoalStatus } from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GoalTaskRow } from "./goal-task-row";

type LevelRoadmapProps = {
  goalId: string;
  levels: GoalLevelView[];
  goalStatus: JarvisGoalStatus;
};

type LevelEditorMode = "none" | "editName" | "deleteConfirm";

function levelStateLabel(state: GoalLevelView["state"]): string {
  switch (state) {
    case "complete":
      return "Complete";
    case "current":
      return "Current";
    default:
      return "Locked";
  }
}

export function LevelRoadmap({ goalId, levels, goalStatus }: LevelRoadmapProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingTaskLevelId, setAddingTaskLevelId] = useState<string | null>(null);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskAddError, setTaskAddError] = useState<string | null>(null);
  const [addingLevel, setAddingLevel] = useState(false);
  const [levelNameDraft, setLevelNameDraft] = useState("");
  const [firstTaskDraft, setFirstTaskDraft] = useState("");
  const [levelAddError, setLevelAddError] = useState<string | null>(null);
  const [levelEditorId, setLevelEditorId] = useState<string | null>(null);
  const [levelEditorMode, setLevelEditorMode] = useState<LevelEditorMode>("none");
  const [levelNameEditDraft, setLevelNameEditDraft] = useState("");
  const [levelStructuralError, setLevelStructuralError] = useState<string | null>(null);
  const [movingLevelId, setMovingLevelId] = useState<string | null>(null);

  const canAddTasks = goalStatus === "active";
  const canAddLevels = goalStatus === "active";
  const canDeleteLevels = goalStatus === "active";
  const canMoveLevels = goalStatus === "active";
  const levelStructuralOpen = levelEditorId !== null && levelEditorMode !== "none";
  const anyLevelAddOpen = addingLevel;
  const anyTaskAddOpen = addingTaskLevelId !== null;

  if (levels.length === 0) {
    return <p className="goals-roadmap-empty">No roadmap levels yet.</p>;
  }

  function closeTaskAddEditor() {
    setAddingTaskLevelId(null);
    setTaskTitleDraft("");
    setTaskAddError(null);
  }

  function closeLevelAddEditor() {
    setAddingLevel(false);
    setLevelNameDraft("");
    setFirstTaskDraft("");
    setLevelAddError(null);
  }

  function closeLevelEditor() {
    setLevelEditorId(null);
    setLevelEditorMode("none");
    setLevelNameEditDraft("");
    setLevelStructuralError(null);
  }

  function handleSaveTaskAdd(levelId: string) {
    setTaskAddError(null);

    startTransition(async () => {
      const result = await addGoalTask(levelId, taskTitleDraft);

      if (!result.ok) {
        setTaskAddError(result.error);
        return;
      }

      closeTaskAddEditor();
      router.refresh();
    });
  }

  function handleSaveLevelAdd() {
    setLevelAddError(null);

    startTransition(async () => {
      const result = await addGoalLevel(goalId, levelNameDraft, firstTaskDraft);

      if (!result.ok) {
        setLevelAddError(result.error);
        return;
      }

      closeLevelAddEditor();
      router.refresh();
    });
  }

  function handleSaveLevelName(levelId: string) {
    setLevelStructuralError(null);

    startTransition(async () => {
      const result = await editGoalLevelName(levelId, levelNameEditDraft);

      if (!result.ok) {
        setLevelStructuralError(result.error);
        return;
      }

      closeLevelEditor();
      router.refresh();
    });
  }

  function handleConfirmLevelDelete(levelId: string) {
    setLevelStructuralError(null);

    startTransition(async () => {
      const result = await deleteGoalLevel(levelId);

      if (!result.ok) {
        setLevelStructuralError(result.error);
        return;
      }

      closeLevelEditor();
      router.refresh();
    });
  }

  function handleMoveLevel(levelId: string, direction: "up" | "down") {
    setLevelStructuralError(null);
    setMovingLevelId(levelId);

    startTransition(async () => {
      const result = await moveGoalLevel(levelId, direction);

      setMovingLevelId(null);

      if (!result.ok) {
        setLevelStructuralError(result.error);
        return;
      }

      router.refresh();
    });
  }

  const levelStructuralDisabled =
    isPending || levelStructuralOpen || anyLevelAddOpen || anyTaskAddOpen || movingLevelId !== null;

  return (
    <>
      <ol className="goals-roadmap" aria-label="Goal roadmap">
        {levels.map((level, index) => {
          const isLevelEditing = levelEditorId === level.id;
          const levelEditorOpen = isLevelEditing && levelEditorMode !== "none";
          const isFirstLevel = index === 0;
          const isLastLevel = index === levels.length - 1;
          const levelMovePending = movingLevelId === level.id;

          return (
            <li
              key={level.id}
              className={`goals-roadmap-level goals-roadmap-level--${level.state}${
                index === levels.length - 1 ? " goals-roadmap-level--last" : ""
              }`}
            >
              <div className="goals-roadmap-marker" aria-hidden="true">
                <span className="goals-roadmap-dot" />
                {index < levels.length - 1 ? (
                  <span className="goals-roadmap-connector" />
                ) : null}
              </div>
              <div className="goals-roadmap-content">
                <div className="goals-roadmap-head">
                  {isLevelEditing && levelEditorMode === "editName" ? (
                    <div className="goals-task-editor goals-level-editor">
                      <input
                        type="text"
                        className="goals-task-input"
                        value={levelNameEditDraft}
                        onChange={(event) => setLevelNameEditDraft(event.target.value)}
                        disabled={isPending}
                        placeholder="Level name"
                      />
                      <div className="goals-task-editor-actions">
                        <button
                          type="button"
                          className="goals-task-action goals-task-action--primary"
                          disabled={isPending}
                          onClick={() => handleSaveLevelName(level.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="goals-task-action"
                          disabled={isPending}
                          onClick={closeLevelEditor}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <h3 className="goals-roadmap-level-name">{level.name}</h3>
                  )}
                  <span className="goals-roadmap-state">{levelStateLabel(level.state)}</span>
                </div>
                {level.tasks.length > 0 ? (
                  <>
                    <p className="goals-roadmap-tasks-label">Tasks</p>
                    <ul className="goals-task-list">
                      {level.tasks.map((task, taskIndex) => (
                        <GoalTaskRow
                          key={task.id}
                          task={task}
                          levelState={level.state}
                          goalStatus={goalStatus}
                          levelTaskCount={level.tasks.length}
                          taskIndex={taskIndex}
                          levelStructuralPending={levelEditorOpen || levelMovePending}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="goals-roadmap-level-empty">No tasks in this level.</p>
                )}
                {canAddTasks ? (
                  <div className="goals-level-add">
                    {addingTaskLevelId === level.id ? (
                      <div className="goals-task-editor">
                        <input
                          type="text"
                          className="goals-task-input"
                          value={taskTitleDraft}
                          onChange={(event) => setTaskTitleDraft(event.target.value)}
                          disabled={isPending || levelEditorOpen}
                          placeholder="Task title"
                        />
                        <div className="goals-task-editor-actions">
                          <button
                            type="button"
                            className="goals-task-action goals-task-action--primary"
                            disabled={isPending || levelEditorOpen}
                            onClick={() => handleSaveTaskAdd(level.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="goals-task-action"
                            disabled={isPending}
                            onClick={closeTaskAddEditor}
                          >
                            Cancel
                          </button>
                        </div>
                        {taskAddError ? <p className="goals-task-error">{taskAddError}</p> : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="goals-task-action"
                        disabled={levelStructuralDisabled || levelEditorOpen}
                        onClick={() => {
                          setTaskAddError(null);
                          setTaskTitleDraft("");
                          setAddingTaskLevelId(level.id);
                        }}
                      >
                        Add task
                      </button>
                    )}
                  </div>
                ) : null}
                {levelEditorMode === "deleteConfirm" && isLevelEditing ? (
                  <div className="goals-task-editor goals-level-editor">
                    <p className="goals-task-delete-prompt">
                      Delete this level and all {level.tasks.length}{" "}
                      {level.tasks.length === 1 ? "task" : "tasks"}?
                    </p>
                    <div className="goals-task-editor-actions">
                      <button
                        type="button"
                        className="goals-task-action goals-task-action--danger"
                        disabled={isPending}
                        onClick={() => handleConfirmLevelDelete(level.id)}
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        className="goals-task-action"
                        disabled={isPending}
                        onClick={closeLevelEditor}
                      >
                        Cancel
                      </button>
                    </div>
                    {levelStructuralError ? (
                      <p className="goals-task-error">{levelStructuralError}</p>
                    ) : null}
                  </div>
                ) : levelEditorMode === "none" || !isLevelEditing ? (
                  <div className="goals-level-actions">
                    {canMoveLevels ? (
                      <>
                        <button
                          type="button"
                          className="goals-task-action"
                          disabled={levelStructuralDisabled || isFirstLevel}
                          aria-label={`Move ${level.name} up`}
                          onClick={() => handleMoveLevel(level.id, "up")}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="goals-task-action"
                          disabled={levelStructuralDisabled || isLastLevel}
                          aria-label={`Move ${level.name} down`}
                          onClick={() => handleMoveLevel(level.id, "down")}
                        >
                          Move down
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="goals-task-action"
                      disabled={levelStructuralDisabled}
                      onClick={() => {
                        setLevelStructuralError(null);
                        setLevelNameEditDraft(level.name);
                        setLevelEditorId(level.id);
                        setLevelEditorMode("editName");
                      }}
                    >
                      Edit level
                    </button>
                    {canDeleteLevels ? (
                      <button
                        type="button"
                        className="goals-task-action goals-task-action--danger"
                        disabled={levelStructuralDisabled}
                        onClick={() => {
                          setLevelStructuralError(null);
                          setLevelEditorId(level.id);
                          setLevelEditorMode("deleteConfirm");
                        }}
                      >
                        Delete level
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {levelEditorMode === "editName" && isLevelEditing && levelStructuralError ? (
                  <p className="goals-task-error">{levelStructuralError}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {canAddLevels ? (
        <div className="goals-roadmap-add-level">
          {addingLevel ? (
            <div className="goals-task-editor">
              <input
                type="text"
                className="goals-task-input"
                value={levelNameDraft}
                onChange={(event) => setLevelNameDraft(event.target.value)}
                disabled={isPending}
                placeholder="Level name"
              />
              <input
                type="text"
                className="goals-task-input"
                value={firstTaskDraft}
                onChange={(event) => setFirstTaskDraft(event.target.value)}
                disabled={isPending}
                placeholder="First task"
              />
              <div className="goals-task-editor-actions">
                <button
                  type="button"
                  className="goals-task-action goals-task-action--primary"
                  disabled={isPending}
                  onClick={handleSaveLevelAdd}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="goals-task-action"
                  disabled={isPending}
                  onClick={closeLevelAddEditor}
                >
                  Cancel
                </button>
              </div>
              {levelAddError ? <p className="goals-task-error">{levelAddError}</p> : null}
            </div>
          ) : (
            <button
              type="button"
              className="goals-task-action"
              disabled={levelStructuralDisabled}
              onClick={() => {
                setLevelAddError(null);
                setLevelNameDraft("");
                setFirstTaskDraft("");
                setAddingLevel(true);
              }}
            >
              Add level
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
