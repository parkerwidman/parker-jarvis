"use client";

import {
  publishLongTermGoal,
  publishShortTermGoal,
  publishThreeMonthGoal,
  type PublishGoalResult,
} from "@/app/goals/actions";
import type { GoalBuilderInput } from "@/lib/jarvis/goals/create-goal";
import {
  domainLabel,
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
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useGoalsDomain } from "./goals-domain-provider";

type BuilderTask = {
  key: string;
  title: string;
};

type BuilderLevel = {
  key: string;
  name: string;
  tasks: BuilderTask[];
};

type GoalBuilderProps = {
  goalType: JarvisGoalType;
};

const PUBLISH_ACTIONS: Record<
  JarvisGoalType,
  (payload: GoalBuilderInput) => Promise<PublishGoalResult>
> = {
  short_term: publishShortTermGoal,
  three_month: publishThreeMonthGoal,
  long_term: publishLongTermGoal,
};

let builderKeyCounter = 0;

function nextBuilderKey(prefix: string): string {
  builderKeyCounter += 1;
  return `${prefix}-${builderKeyCounter}`;
}

function createTask(title = ""): BuilderTask {
  return { key: nextBuilderKey("task"), title };
}

function createLevel(name = "", tasks: BuilderTask[] = [createTask()]): BuilderLevel {
  return { key: nextBuilderKey("level"), name, tasks };
}

function createInitialDraft(domain: JarvisGoalDomain): {
  title: string;
  description: string;
  domain: JarvisGoalDomain;
  levels: BuilderLevel[];
} {
  return {
    title: "",
    description: "",
    domain,
    levels: [createLevel()],
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

export function GoalBuilder({ goalType }: GoalBuilderProps) {
  const formId = useId();
  const router = useRouter();
  const { domain: pageDomain } = useGoalsDomain();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => createInitialDraft(pageDomain));

  useEffect(() => {
    setDraft((current) => ({ ...current, domain: pageDomain }));
  }, [pageDomain]);

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
        domain: draft.domain,
        levels: draft.levels.map((level) => ({
          name: level.name,
          tasks: level.tasks.map((task) => task.title),
        })),
      };

      startTransition(async () => {
        const result = await publish(payload);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setDraft(createInitialDraft(draft.domain));
        router.refresh();
      });
    },
    [draft, publish, router],
  );

  const domainButtons = useMemo(
    () =>
      (["personal", "melusi"] as const).map((value) => ({
        value,
        label: domainLabel(value),
        active: draft.domain === value,
      })),
    [draft.domain],
  );

  return (
    <section className="goals-builder" aria-labelledby={`${formId}-heading`}>
      <div className="goals-builder-head">
        <h2 className="goals-builder-title" id={`${formId}-heading`}>
          {builderHeading(goalType)}
        </h2>
        <p className="goals-builder-subtitle">
          Build the roadmap for a new {config.title.toLowerCase()} entry.
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
          <span className="goals-builder-label">Domain</span>
          <div className="goals-builder-domain" role="group" aria-label="Goal domain">
            {domainButtons.map(({ value, label, active }) => (
              <button
                key={value}
                type="button"
                className={`goals-builder-domain-btn goals-builder-domain-btn--${value}${
                  active ? " goals-builder-domain-btn--active" : ""
                }`}
                aria-pressed={active}
                disabled={isPending}
                onClick={() =>
                  updateDraft((current) => ({ ...current, domain: value }))
                }
              >
                {label}
              </button>
            ))}
          </div>
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
                            ? { ...entry, tasks: [...entry.tasks, createTask()] }
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
                levels: [...current.levels, createLevel()],
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
    </section>
  );
}
