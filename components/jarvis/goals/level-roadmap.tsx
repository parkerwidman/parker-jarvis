"use client";

import { addGoalTask } from "@/app/goals/actions";
import type { GoalLevelView, JarvisGoalStatus } from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GoalTaskRow } from "./goal-task-row";

type LevelRoadmapProps = {
  levels: GoalLevelView[];
  goalStatus: JarvisGoalStatus;
};

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

export function LevelRoadmap({ levels, goalStatus }: LevelRoadmapProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingLevelId, setAddingLevelId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const canAddTasks = goalStatus === "active";

  if (levels.length === 0) {
    return <p className="goals-roadmap-empty">No roadmap levels yet.</p>;
  }

  function closeAddEditor() {
    setAddingLevelId(null);
    setTitleDraft("");
    setAddError(null);
  }

  function handleSaveAdd(levelId: string) {
    setAddError(null);

    startTransition(async () => {
      const result = await addGoalTask(levelId, titleDraft);

      if (!result.ok) {
        setAddError(result.error);
        return;
      }

      closeAddEditor();
      router.refresh();
    });
  }

  return (
    <ol className="goals-roadmap" aria-label="Goal roadmap">
      {levels.map((level, index) => (
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
              <h3 className="goals-roadmap-level-name">{level.name}</h3>
              <span className="goals-roadmap-state">{levelStateLabel(level.state)}</span>
            </div>
            {level.tasks.length > 0 ? (
              <>
                <p className="goals-roadmap-tasks-label">Tasks</p>
                <ul className="goals-task-list">
                  {level.tasks.map((task) => (
                    <GoalTaskRow
                      key={task.id}
                      task={task}
                      levelState={level.state}
                      goalStatus={goalStatus}
                      levelTaskCount={level.tasks.length}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="goals-roadmap-level-empty">No tasks in this level.</p>
            )}
            {canAddTasks ? (
              <div className="goals-level-add">
                {addingLevelId === level.id ? (
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
                        onClick={() => handleSaveAdd(level.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="goals-task-action"
                        disabled={isPending}
                        onClick={closeAddEditor}
                      >
                        Cancel
                      </button>
                    </div>
                    {addError ? <p className="goals-task-error">{addError}</p> : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="goals-task-action"
                    disabled={isPending || addingLevelId !== null}
                    onClick={() => {
                      setAddError(null);
                      setTitleDraft("");
                      setAddingLevelId(level.id);
                    }}
                  >
                    Add task
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
