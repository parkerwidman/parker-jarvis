"use client";

import {
  publishLongTermGoal,
  publishShortTermGoal,
  publishThreeMonthGoal,
  type PublishGoalResult,
} from "@/app/goals/actions";
import type { GoalBuilderInput, GoalBuilderTaskInput } from "@/lib/jarvis/goals/create-goal";
import {
  GOAL_PAGE_CONFIG,
  type JarvisGoalDomain,
  type JarvisGoalType,
} from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

type BuilderTask = {
  key: string;
  title: string;
  dueDate: string;
};

type BuilderLevel = {
  key: string;
  name: string;
  tasks: BuilderTask[];
};

type GoalBuilderProps = {
  goalType: JarvisGoalType;
  workspaceDomain: JarvisGoalDomain;
  defaultOpen?: boolean;
};

const PUBLISH_ACTIONS: Record<
  JarvisGoalType,
  (payload: GoalBuilderInput) => Promise<PublishGoalResult>
> = {
  short_term: publishShortTermGoal,
  three_month: publishThreeMonthGoal,
  long_term: publishLongTermGoal,
};

const INITIAL_BUILDER_LEVEL_KEY = "initial-level";
const INITIAL_BUILDER_TASK_KEY = "initial-task";

function createTask(key: string, title = "", dueDate = ""): BuilderTask {
  return { key, title, dueDate };
}

function createLevel(
  key: string,
  name = "",
  tasks: BuilderTask[] = [createTask(INITIAL_BUILDER_TASK_KEY)],
): BuilderLevel {
  return { key, name, tasks };
}

function createInitialDraft(domain: JarvisGoalDomain): {
  title: string;
  description: string;
  notes: string;
  targetDate: string;
  domain: JarvisGoalDomain;
  levels: BuilderLevel[];
} {
  return {
    title: "",
    description: "",
    notes: "",
    targetDate: "",
    domain,
    levels: [createLevel(INITIAL_BUILDER_LEVEL_KEY)],
  };
}

function builderHeading(goalType: JarvisGoalType): string {
  switch (goalType) {
    case "short_term":
      return "Add a short term goal";
    case "three_month":
      return "Add a 3 month goal";
    case "long_term":
      return "Add a long term goal";
  }
}

export function GoalBuilder({
  goalType,
  workspaceDomain,
  defaultOpen = false,
}: GoalBuilderProps) {
  const formId = useId();
  const router = useRouter();
  const nextKeyRef = useRef(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(() => createInitialDraft(workspaceDomain));

  const nextBuilderKey = useCallback((prefix: string) => {
    nextKeyRef.current += 1;
    return `${prefix}-${nextKeyRef.current}`;
  }, []);

  const resetDraft = useCallback((domain: JarvisGoalDomain) => {
    nextKeyRef.current = 0;
    return createInitialDraft(domain);
  }, []);

  const createNewLevel = useCallback((): BuilderLevel => {
    const levelKey = nextBuilderKey("level");
    const taskKey = nextBuilderKey("task");
    return createLevel(levelKey, "", [createTask(taskKey)]);
  }, [nextBuilderKey]);

  useEffect(() => {
    setDraft((current) => ({ ...current, domain: workspaceDomain }));
  }, [workspaceDomain]);

  const config = GOAL_PAGE_CONFIG[goalType];
  const publish = PUBLISH_ACTIONS[goalType];

  const canRemoveLevel = draft.levels.length > 1;

  const updateDraft = useCallback(
    (updater: (current: typeof draft) => typeof draft) => {
      setDraft((current) => updater(current));
    },
    [],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      const payload: GoalBuilderInput = {
        title: draft.title,
        description: draft.description,
        notes: draft.notes,
        targetDate: draft.targetDate || null,
        domain: workspaceDomain,
        levels: draft.levels.map((level) => ({
          name: level.name,
          tasks: level.tasks.map((task): GoalBuilderTaskInput => ({
            title: task.title,
            dueAt: task.dueDate || null,
          })),
        })),
      };

      startTransition(async () => {
        const result = await publish(payload);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setDraft(resetDraft(workspaceDomain));
        setIsOpen(false);
        router.refresh();
      });
    },
    [draft, publish, resetDraft, router, workspaceDomain],
  );

  return (
    <section className="gd2-builder" aria-labelledby={`${formId}-heading`}>
      <button
        type="button"
        className="gd2-builder-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="gd2-builder-toggle-icon">{isOpen ? "−" : "+"}</span>
        <span>Add Goal</span>
      </button>

      {isOpen ? (
        <>
          <div className="goals-builder-head">
            <h2 className="goals-builder-title" id={`${formId}-heading`}>
              {builderHeading(goalType)}
            </h2>
            <p className="goals-builder-subtitle">
              Build the roadmap for a new {config.title.toLowerCase()} entry in{" "}
              {workspaceDomain === "personal" ? "Personal" : "Melusi"}.
            </p>
          </div>

          <form className="goals-builder-form" onSubmit={handleSubmit}>
        <div className="goals-builder-field">
          <label className="goals-builder-label" htmlFor={`${formId}-title`}>
            Goal title
          </label>
          <input
            id={`${formId}-title`}
            className="goals-builder-input goals-builder-input--title"
            name="goal-name"
            value={draft.title}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="What are you working toward?"
            maxLength={200}
            disabled={isPending}
            autoComplete="off"
          />
        </div>

        <div className="goals-builder-field">
          <label className="goals-builder-label" htmlFor={`${formId}-description`}>
            Description <span className="goals-builder-optional">optional</span>
          </label>
          <textarea
            id={`${formId}-description`}
            className="goals-builder-textarea"
            value={draft.description}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Add context if helpful."
            maxLength={2000}
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="goals-builder-field">
          <label className="goals-builder-label" htmlFor={`${formId}-notes`}>
            Notes <span className="goals-builder-optional">optional</span>
          </label>
          <textarea
            id={`${formId}-notes`}
            className="goals-builder-textarea"
            value={draft.notes}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Additional notes for this goal."
            maxLength={2000}
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="goals-builder-field">
          <label className="goals-builder-label" htmlFor={`${formId}-target-date`}>
            Target date <span className="goals-builder-optional">optional</span>
          </label>
          <input
            id={`${formId}-target-date`}
            type="date"
            className="goals-builder-input"
            value={draft.targetDate}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                targetDate: event.target.value,
              }))
            }
            disabled={isPending}
          />
        </div>

        <div className="goals-builder-levels">
          {draft.levels.map((level, levelIndex) => {
            const canRemoveTask = level.tasks.length > 1;

            return (
              <article
                key={level.key}
                className="goals-builder-level"
                aria-label={`Level ${levelIndex + 1}`}
              >
                <div className="goals-builder-level-head">
                  <span className="goals-builder-level-index">Level {levelIndex + 1}</span>
                  {canRemoveLevel ? (
                    <button
                      type="button"
                      className="goals-builder-remove"
                      disabled={isPending}
                      onClick={() =>
                        updateDraft((current) => ({
                          ...current,
                          levels: current.levels.filter(
                            (entry) => entry.key !== level.key,
                          ),
                        }))
                      }
                    >
                      Remove level
                    </button>
                  ) : null}
                </div>

                <div className="goals-builder-field">
                  <label
                    className="goals-builder-label"
                    htmlFor={`${formId}-level-${level.key}`}
                  >
                    Level name
                  </label>
                  <input
                    id={`${formId}-level-${level.key}`}
                    className="goals-builder-input"
                    value={level.name}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        levels: current.levels.map((entry) =>
                          entry.key === level.key
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="Name this roadmap stage"
                    maxLength={200}
                    disabled={isPending}
                    autoComplete="off"
                  />
                </div>

                <div className="goals-builder-tasks">
                  {level.tasks.map((task, taskIndex) => (
                    <div key={task.key} className="goals-builder-task-row">
                      <label
                        className="goals-builder-task-label"
                        htmlFor={`${formId}-task-${task.key}`}
                      >
                        Task {taskIndex + 1}
                      </label>
                      <div className="goals-builder-task-input-wrap">
                        <input
                          id={`${formId}-task-${task.key}`}
                          className="goals-builder-input"
                          value={task.title}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              levels: current.levels.map((entry) =>
                                entry.key === level.key
                                  ? {
                                      ...entry,
                                      tasks: entry.tasks.map((taskEntry) =>
                                        taskEntry.key === task.key
                                          ? {
                                              ...taskEntry,
                                              title: event.target.value,
                                            }
                                          : taskEntry,
                                      ),
                                    }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Task title"
                          maxLength={200}
                          disabled={isPending}
                          autoComplete="off"
                        />
                        <input
                          type="date"
                          className="goals-builder-input goals-builder-input--due-date"
                          value={task.dueDate}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              levels: current.levels.map((entry) =>
                                entry.key === level.key
                                  ? {
                                      ...entry,
                                      tasks: entry.tasks.map((taskEntry) =>
                                        taskEntry.key === task.key
                                          ? {
                                              ...taskEntry,
                                              dueDate: event.target.value,
                                            }
                                          : taskEntry,
                                      ),
                                    }
                                  : entry,
                              ),
                            }))
                          }
                          disabled={isPending}
                          aria-label={`Task ${taskIndex + 1} due date`}
                        />
                        {canRemoveTask ? (
                          <button
                            type="button"
                            className="goals-builder-remove"
                            disabled={isPending}
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                levels: current.levels.map((entry) =>
                                  entry.key === level.key
                                    ? {
                                        ...entry,
                                        tasks: entry.tasks.filter(
                                          (taskEntry) => taskEntry.key !== task.key,
                                        ),
                                      }
                                    : entry,
                                ),
                              }))
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="goals-builder-add"
                    disabled={isPending}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        levels: current.levels.map((entry) =>
                          entry.key === level.key
                            ? {
                                ...entry,
                                tasks: [...entry.tasks, createTask(nextBuilderKey("task"))],
                              }
                            : entry,
                        ),
                      }))
                    }
                  >
                    + Add task to this level
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="goals-builder-actions">
          <button
            type="button"
            className="goals-builder-add goals-builder-add--level"
            disabled={isPending}
            onClick={() =>
              updateDraft((current) => ({
                ...current,
                levels: [...current.levels, createNewLevel()],
              }))
            }
          >
            + Add level
          </button>

          <button
            type="submit"
            className="goals-builder-publish"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? "Publishing…" : "Publish goal"}
          </button>
        </div>

        {error ? (
          <p className="goals-builder-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
        </>
      ) : null}
    </section>
  );
}
