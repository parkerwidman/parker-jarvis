"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createScheduleBlockAction,
  deleteScheduleBlockAction,
  saveScheduleBlockAction,
} from "@/app/schedule/actions";
import { ScheduleCategoryIcon } from "@/lib/jarvis/schedule/schedule-category-icons";
import {
  SCHEDULE_CATEGORY_STYLES,
  sortCategoriesForLegend,
} from "@/lib/jarvis/schedule/schedule-category-styles";
import { getMondayZeroDayOfWeek } from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleCreateKind,
  ScheduleDeleteScope,
  ScheduleEditScope,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import {
  requiresRecurringDeleteScope,
  requiresRecurringSaveScope,
} from "@/lib/jarvis/schedule/schedule-mutation-logic";
import { SCHEDULE_CATEGORIES } from "@/lib/jarvis/schedule/schedule-types";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";

type EditorStep =
  | "form"
  | "save_scope"
  | "delete_scope"
  | "delete_entire_confirm";

type ScheduleEditorProps = {
  open: boolean;
  mode: "create" | "edit";
  schedule: JarvisSchedule;
  context: ScheduleBlockEditContext | null;
  defaultDate: string;
  onClose: () => void;
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

function buildCreateDefaults(
  schedule: JarvisSchedule,
  defaultDate: string,
): ScheduleBlockFormValues & { effectiveStartDate: string } {
  return {
    title: "",
    category: "other",
    occurrenceDate: defaultDate,
    dayOfWeek: getMondayZeroDayOfWeek(defaultDate),
    startTime: "09:00",
    endTime: "10:00",
    isOpenEnded: false,
    notes: null,
    effectiveStartDate: schedule.startDate,
  };
}

function contextToForm(
  context: ScheduleBlockEditContext,
): ScheduleBlockFormValues {
  return {
    title: context.title,
    category: context.category,
    occurrenceDate: context.occurrenceDate,
    dayOfWeek: context.dayOfWeek,
    startTime: context.startTime,
    endTime: context.endTime,
    isOpenEnded: context.isOpenEnded,
    notes: context.notes,
  };
}

export function ScheduleEditor({
  open,
  mode,
  schedule,
  context,
  defaultDate,
  onClose,
}: ScheduleEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<EditorStep>("form");
  const [createKind, setCreateKind] = useState<ScheduleCreateKind>("recurring");
  const [error, setError] = useState<string | null>(null);
  const [saveScope, setSaveScope] = useState<ScheduleEditScope>("this_date_only");
  const [deleteScope, setDeleteScope] =
    useState<ScheduleDeleteScope>("this_date_only");
  const [form, setForm] = useState<
    ScheduleBlockFormValues & { effectiveStartDate: string }
  >(buildCreateDefaults(schedule, defaultDate));

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep("form");
    setError(null);
    setSaveScope("this_date_only");
    setDeleteScope("this_date_only");
    setCreateKind("recurring");

    if (mode === "edit" && context) {
      setForm({
        ...contextToForm(context),
        effectiveStartDate: schedule.startDate,
      });
    } else {
      setForm(buildCreateDefaults(schedule, defaultDate));
    }
  }, [open, mode, context, defaultDate, schedule.startDate]);

  const categoryOptions = useMemo(
    () => sortCategoriesForLegend([...SCHEDULE_CATEGORIES]),
    [],
  );

  if (!open) {
    return null;
  }

  const headerTitle =
    mode === "create" ? "Add Block" : form.title.trim() || "Schedule Block";
  const headerSubtitle =
    mode === "edit" && context
      ? `${context.weekdayLabel}, ${formatDisplayDate(form.occurrenceDate)}`
      : "Create a new schedule block";

  function formatDisplayDate(localDate: string): string {
    const [year, month, day] = localDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function updateForm<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "occurrenceDate" && typeof value === "string") {
        next.dayOfWeek = getMondayZeroDayOfWeek(value);
      }

      return next;
    });
  }

  function handleSaveClick() {
    setError(null);

    if (mode === "create") {
      startTransition(async () => {
        const payload =
          createKind === "recurring"
            ? {
                kind: "recurring" as const,
                form: {
                  scheduleId: schedule.id,
                  title: form.title,
                  category: form.category,
                  occurrenceDate: form.occurrenceDate,
                  dayOfWeek: form.dayOfWeek,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  isOpenEnded: form.isOpenEnded,
                  notes: form.notes,
                  effectiveStartDate: form.effectiveStartDate,
                },
              }
            : {
                kind: "one_time" as const,
                form: {
                  scheduleId: schedule.id,
                  title: form.title,
                  category: form.category,
                  occurrenceDate: form.occurrenceDate,
                  dayOfWeek: form.dayOfWeek,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  isOpenEnded: form.isOpenEnded,
                  notes: form.notes,
                },
              };

        const result = await createScheduleBlockAction({
          ...payload,
          scheduleStartDate: schedule.startDate,
          scheduleEndDate: schedule.endDate,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        router.refresh();
        onClose();
      });
      return;
    }

    if (!context) {
      return;
    }

    if (requiresRecurringSaveScope(context.source, context.scheduleItemId)) {
      setStep("save_scope");
      return;
    }

    executeSave(context, "this_date_only");
  }

  function executeSave(
    editContext: ScheduleBlockEditContext,
    scope: ScheduleEditScope,
  ) {
    startTransition(async () => {
      const result = await saveScheduleBlockAction({
        context: editContext,
        form,
        scope,
        scheduleStartDate: schedule.startDate,
        scheduleEndDate: schedule.endDate,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  function handleDeleteClick() {
    setError(null);

    if (!context) {
      return;
    }

    if (requiresRecurringDeleteScope(context.source, context.scheduleItemId)) {
      setStep("delete_scope");
      return;
    }

    startTransition(async () => {
      const result = await deleteScheduleBlockAction({
        context,
        scope: "this_date_only",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  function executeDelete(scope: ScheduleDeleteScope) {
    if (!context) {
      return;
    }

    if (scope === "entire_series") {
      setStep("delete_entire_confirm");
      setDeleteScope(scope);
      return;
    }

    startTransition(async () => {
      const result = await deleteScheduleBlockAction({ context, scope });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <div className="schedule-editor-overlay" role="presentation">
      <button
        type="button"
        className="schedule-editor-backdrop"
        aria-label="Close schedule editor"
        onClick={onClose}
      />
      <section
        className="schedule-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-editor-title"
      >
        <header className="schedule-editor-header">
          <div className="schedule-editor-header-copy">
            <div className="schedule-editor-header-icon">
              <ScheduleCategoryIcon category={form.category} size={18} />
            </div>
            <div>
              <h2 id="schedule-editor-title" className="schedule-editor-title">
                {headerTitle}
              </h2>
              <p className="schedule-editor-subtitle">{headerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="schedule-icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {step === "form" ? (
          <div className="schedule-editor-body">
            {mode === "create" ? (
              <div className="schedule-editor-field">
                <span className="schedule-editor-label">Block type</span>
                <div className="schedule-editor-segmented">
                  <button
                    type="button"
                    className={`schedule-editor-segment${createKind === "recurring" ? " schedule-editor-segment--active" : ""}`}
                    onClick={() => setCreateKind("recurring")}
                  >
                    Recurring weekly
                  </button>
                  <button
                    type="button"
                    className={`schedule-editor-segment${createKind === "one_time" ? " schedule-editor-segment--active" : ""}`}
                    onClick={() => setCreateKind("one_time")}
                  >
                    One-time
                  </button>
                </div>
              </div>
            ) : null}

            <label className="schedule-editor-field">
              <span className="schedule-editor-label">Title</span>
              <input
                className="schedule-editor-input"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
              />
            </label>

            <label className="schedule-editor-field">
              <span className="schedule-editor-label">Category</span>
              <select
                className="schedule-editor-input"
                value={form.category}
                onChange={(event) =>
                  updateForm(
                    "category",
                    event.target.value as ScheduleBlockFormValues["category"],
                  )
                }
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {SCHEDULE_CATEGORY_STYLES[category].label}
                  </option>
                ))}
              </select>
            </label>

            {mode === "create" && createKind === "recurring" ? (
              <>
                <label className="schedule-editor-field">
                  <span className="schedule-editor-label">Weekday</span>
                  <select
                    className="schedule-editor-input"
                    value={form.dayOfWeek}
                    onChange={(event) =>
                      updateForm("dayOfWeek", Number(event.target.value))
                    }
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="schedule-editor-field">
                  <span className="schedule-editor-label">Starts</span>
                  <input
                    type="date"
                    className="schedule-editor-input"
                    value={form.effectiveStartDate}
                    min={schedule.startDate}
                    max={schedule.endDate}
                    onChange={(event) =>
                      updateForm("effectiveStartDate", event.target.value)
                    }
                  />
                </label>
              </>
            ) : (
              <label className="schedule-editor-field">
                <span className="schedule-editor-label">Date</span>
                <input
                  type="date"
                  className="schedule-editor-input"
                  value={form.occurrenceDate}
                  min={schedule.startDate}
                  max={schedule.endDate}
                  onChange={(event) =>
                    updateForm("occurrenceDate", event.target.value)
                  }
                />
              </label>
            )}

            {mode === "edit" &&
            context &&
            requiresRecurringSaveScope(context.source, context.scheduleItemId) ? (
              <label className="schedule-editor-field">
                <span className="schedule-editor-label">Weekday</span>
                <select
                  className="schedule-editor-input"
                  value={form.dayOfWeek}
                  onChange={(event) =>
                    updateForm("dayOfWeek", Number(event.target.value))
                  }
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="schedule-editor-row">
              <label className="schedule-editor-field schedule-editor-field--half">
                <span className="schedule-editor-label">Start</span>
                <input
                  type="time"
                  className="schedule-editor-input"
                  value={form.startTime}
                  onChange={(event) =>
                    updateForm("startTime", event.target.value)
                  }
                />
              </label>
              <label className="schedule-editor-field schedule-editor-field--half">
                <span className="schedule-editor-label">End</span>
                <input
                  type="time"
                  className="schedule-editor-input"
                  value={form.endTime ?? ""}
                  disabled={form.isOpenEnded}
                  onChange={(event) =>
                    updateForm("endTime", event.target.value)
                  }
                />
              </label>
            </div>

            <label className="schedule-editor-checkbox">
              <input
                type="checkbox"
                checked={form.isOpenEnded}
                onChange={(event) =>
                  updateForm("isOpenEnded", event.target.checked)
                }
              />
              <span>Open-ended block</span>
            </label>

            <label className="schedule-editor-field">
              <span className="schedule-editor-label">Notes</span>
              <textarea
                className="schedule-editor-textarea"
                rows={3}
                value={form.notes ?? ""}
                onChange={(event) =>
                  updateForm("notes", event.target.value || null)
                }
              />
            </label>

            {error ? <p className="schedule-editor-error">{error}</p> : null}
          </div>
        ) : null}

        {step === "save_scope" && context ? (
          <div className="schedule-editor-body">
            <p className="schedule-editor-scope-title">Apply these changes to:</p>
            <div className="schedule-editor-scope-list">
              <ScopeOption
                checked={saveScope === "this_date_only"}
                title="This date only"
                description="Changes only the selected calendar occurrence."
                onSelect={() => setSaveScope("this_date_only")}
              />
              <ScopeOption
                checked={saveScope === "this_and_future"}
                title="This and future"
                description="Changes this recurrence beginning with this occurrence."
                onSelect={() => setSaveScope("this_and_future")}
              />
              <ScopeOption
                checked={saveScope === "entire_series"}
                title="Entire series"
                description="Changes the recurring block throughout its full effective range."
                onSelect={() => setSaveScope("entire_series")}
              />
            </div>
            {error ? <p className="schedule-editor-error">{error}</p> : null}
          </div>
        ) : null}

        {step === "delete_scope" && context ? (
          <div className="schedule-editor-body">
            <p className="schedule-editor-scope-title">Remove:</p>
            <div className="schedule-editor-scope-list">
              <ScopeOption
                checked={deleteScope === "this_date_only"}
                title="This date only"
                description="Skips only the selected calendar occurrence."
                onSelect={() => setDeleteScope("this_date_only")}
              />
              <ScopeOption
                checked={deleteScope === "this_and_future"}
                title="This and future"
                description="Ends the recurrence before this occurrence."
                onSelect={() => setDeleteScope("this_and_future")}
              />
              <ScopeOption
                checked={deleteScope === "entire_series"}
                title="Entire series"
                description="Removes this block from every week in this schedule."
                onSelect={() => setDeleteScope("entire_series")}
              />
            </div>
            {error ? <p className="schedule-editor-error">{error}</p> : null}
          </div>
        ) : null}

        {step === "delete_entire_confirm" && context ? (
          <div className="schedule-editor-body">
            <p className="schedule-editor-scope-title">
              Remove this block from every week in this schedule?
            </p>
            <p className="schedule-editor-scope-copy">
              This permanently deletes the recurring series and cannot be undone
              from the schedule editor.
            </p>
            {error ? <p className="schedule-editor-error">{error}</p> : null}
          </div>
        ) : null}

        <footer className="schedule-editor-footer">
          {step === "form" ? (
            <>
              {mode === "edit" ? (
                <button
                  type="button"
                  className="schedule-editor-button schedule-editor-button--danger"
                  onClick={handleDeleteClick}
                  disabled={isPending}
                >
                  Delete Block
                </button>
              ) : (
                <span />
              )}
              <div className="schedule-editor-footer-actions">
                <button
                  type="button"
                  className="schedule-editor-button schedule-editor-button--secondary"
                  onClick={onClose}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="schedule-editor-button schedule-editor-button--primary"
                  onClick={handleSaveClick}
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          ) : null}

          {step === "save_scope" && context ? (
            <div className="schedule-editor-footer-actions">
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--secondary"
                onClick={() => setStep("form")}
                disabled={isPending}
              >
                Back
              </button>
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--primary"
                onClick={() => executeSave(context, saveScope)}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Confirm Save"}
              </button>
            </div>
          ) : null}

          {step === "delete_scope" && context ? (
            <div className="schedule-editor-footer-actions">
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--secondary"
                onClick={() => setStep("form")}
                disabled={isPending}
              >
                Back
              </button>
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--danger"
                onClick={() => executeDelete(deleteScope)}
                disabled={isPending}
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === "delete_entire_confirm" && context ? (
            <div className="schedule-editor-footer-actions">
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--secondary"
                onClick={() => setStep("delete_scope")}
                disabled={isPending}
              >
                Back
              </button>
              <button
                type="button"
                className="schedule-editor-button schedule-editor-button--danger"
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteScheduleBlockAction({
                      context,
                      scope: "entire_series",
                    });

                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }

                    router.refresh();
                    onClose();
                  });
                }}
                disabled={isPending}
              >
                {isPending ? "Deleting…" : "Delete Entire Series"}
              </button>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function ScopeOption({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`schedule-editor-scope-option${checked ? " schedule-editor-scope-option--active" : ""}`}
      onClick={onSelect}
      aria-pressed={checked}
    >
      <span className="schedule-editor-scope-option-title">{title}</span>
      <span className="schedule-editor-scope-option-desc">{description}</span>
    </button>
  );
}
