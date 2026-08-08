import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadJarvisContext,
} from "@/lib/jarvis/tools/memory-tools";
import {
  listOutlookCalendar,
  type OutlookEvent,
} from "@/lib/jarvis/tools/microsoft-tools";
import {
  loadMelusiPlanningSnapshot,
} from "@/lib/jarvis/projects/load-melusi-planning-snapshot";
import { type TaskRecord } from "@/lib/jarvis/tools/task-tools";
import {
  buildMelusiExpenseBriefContext,
  extractMelusiExpenseSourceCounts,
  mergeMelusiExpenseSourceCountsIntoRoot,
  type MelusiExpenseBriefContext,
} from "@/lib/jarvis/briefings/build-melusi-expense-brief-context";
import {
  buildFinanceBriefContext,
  extractFinanceBriefSourceCounts,
  mergeFinanceBriefSourceCountsIntoRoot,
  type FinanceBriefContext,
  type FinanceBriefSourceCounts,
} from "@/lib/jarvis/briefings/build-finance-brief-context";
import { loadMelusiExpenseBriefSnapshot } from "@/lib/jarvis/briefings/load-melusi-expense-brief-snapshot";
import { loadFinanceBriefSnapshot } from "@/lib/jarvis/briefings/load-finance-brief-snapshot";
import {
  buildMorningBriefInstructions,
  buildMorningBriefPlan,
  buildMorningBriefUserPrompt,
  finalizeMorningBriefSpokenText,
  normalizeMorningBriefSpokenText,
  type MorningBriefEvent,
  type MorningBriefTask,
} from "@/lib/jarvis/briefings/morning-brief-structure";
import {
  getCanonicalPriorityTextFromPlan,
  mergeBriefDisplayIntoSourceCounts,
  validateBriefPriorityTextPresence,
} from "@/lib/jarvis/briefings/morning-brief-display-metadata";
import {
  EMPTY_OUTPUT_REASONS,
  buildSupabaseErrorDiagnostic,
  logMorningBriefDiagnostic,
  logMorningBriefEmptyOutput,
  logMorningBriefIncompleteResponse,
  logMorningBriefOpenAiFailure,
  logMorningBriefStageFailure,
  logMorningBriefSupabaseUpdateFailure,
  MORNING_BRIEF_STAGES,
  OPENAI_FAILURE_CATEGORIES,
  type MorningBriefStage,
} from "@/lib/jarvis/briefings/morning-brief-diagnostics";
import {
  buildMorningBriefOpenAiRequestParams,
  evaluateMorningBriefOpenAiResponse,
} from "@/lib/jarvis/briefings/morning-brief-openai";
import { generateMorningBriefAudio } from "@/lib/jarvis/briefings/generate-morning-brief-audio";
import {
  finalizeMorningBriefRecommendation,
  resolveMorningBriefRecommendedModeFromPriority,
} from "@/lib/jarvis/briefings/morning-brief-recommendation";

const DEFAULT_TIMEZONE = "America/Chicago";
const SAFE_ERROR_MESSAGE = "Jarvis could not generate the morning brief.";
const DUE_SOON_DAYS = 3;

export type GenerateMorningBriefResult =
  | { success: true; briefingDate: string }
  | { success: false; error: string };

type BriefingTask = MorningBriefTask;

type BriefingEvent = MorningBriefEvent;

type MorningBriefTaskRow = TaskRecord & {
  life_area_id: string | null;
  notes: string | null;
  project_id: string | null;
};

type SourceCounts = {
  tasks: number;
  goals: number;
  memories: number;
  emails: number;
  events: number;
  melusiProjects: number;
  melusiProjectTasks: number;
  melusiProjectUpdates: number;
  melusiExpenses?: {
    recurringOverheadStateKey: string | null;
    surfacedSignalKeys: string[];
  };
  finance?: FinanceBriefSourceCounts;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(profileTimezone: string | null | undefined): string {
  const candidate = profileTimezone?.trim();

  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }

  return DEFAULT_TIMEZONE;
}

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getLocalDateFromIso(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatLocalDateLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

function formatDateTimeSection(timeZone: string, now = new Date()): string {
  const utcNow = now.toISOString();
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return `UTC: ${utcNow}\nLocal (${timeZone}): ${localNow}`;
}

async function listMorningBriefTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  { success: true; tasks: MorningBriefTaskRow[] } | { success: false; error: string }
> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, due_at, completed_at, created_at, life_area_id, notes, project_id",
    )
    .eq("user_id", userId)
    .neq("status", "done");

  if (error) {
    return { success: false, error: "Could not list tasks." };
  }

  return { success: true, tasks: (data ?? []) as MorningBriefTaskRow[] };
}

export function prepareMorningBriefTasks(
  tasks: MorningBriefTaskRow[],
  lifeAreaNames: Map<string, string>,
  timeZone: string,
  now = new Date(),
): BriefingTask[] {
  const todayLocal = getLocalDateString(timeZone, now);
  const dueSoonEndLocal = addDaysToLocalDate(todayLocal, DUE_SOON_DAYS);

  return tasks
    .filter((task) => task.status !== "done")
    .map((task) => {
      const dueLocal = task.due_at
        ? getLocalDateFromIso(task.due_at, timeZone)
        : null;
      const overdue = dueLocal !== null && dueLocal < todayLocal;
      const dueToday = dueLocal === todayLocal;
      const dueSoon =
        dueLocal !== null &&
        dueLocal >= todayLocal &&
        dueLocal <= dueSoonEndLocal;

      return {
        id: task.id,
        title: task.title,
        priority: task.priority,
        due_at: task.due_at,
        overdue,
        dueToday,
        dueSoon,
        lifeAreaName: task.life_area_id
          ? (lifeAreaNames.get(task.life_area_id) ?? null)
          : null,
        notes: task.notes,
        projectId: task.project_id,
      };
    });
}

export function prepareMorningBriefEvents(
  events: OutlookEvent[],
  timeZone: string,
): BriefingEvent[] {
  return events
    .filter((event) => !event.isCancelled)
    .map((event) => ({
      subject: event.subject,
      startIso: event.start,
      endIso: event.end,
      localDate: getLocalDateFromIso(event.start, timeZone),
      localStart: event.localStart,
      localEnd: event.localEnd,
      locationName: event.locationName,
      isAllDay: event.isAllDay,
      isCancelled: event.isCancelled,
      showAs: event.showAs,
      importance: event.importance,
    }));
}

async function markBriefingFailed(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
): Promise<void> {
  await supabase
    .from("morning_briefings")
    .update({
      status: "failed",
      safe_error_message: SAFE_ERROR_MESSAGE,
    })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate);
}

export async function generateMorningBrief(
  supabase: SupabaseClient,
  userId: string,
): Promise<GenerateMorningBriefResult> {
  const generationStartedAt = Date.now();
  let currentStage: MorningBriefStage = MORNING_BRIEF_STAGES.contextLoading;
  let briefingDate = "";
  let timeZone = DEFAULT_TIMEZONE;

  try {
    const now = new Date();
    const contextStartedAt = Date.now();
    const context = await loadJarvisContext(supabase, userId);
    timeZone = resolveTimeZone(context.profile?.timezone);
    briefingDate = getLocalDateString(timeZone, now);
    const localDateLabel = formatLocalDateLabel(timeZone, now);

    const [{ data: existingTodayRow }, { data: priorBriefRow }] = await Promise.all([
      supabase
        .from("morning_briefings")
        .select("generated_at, source_counts, status")
        .eq("user_id", userId)
        .eq("briefing_date", briefingDate)
        .maybeSingle(),
      supabase
        .from("morning_briefings")
        .select("generated_at, source_counts")
        .eq("user_id", userId)
        .eq("status", "completed")
        .not("generated_at", "is", null)
        .lt("briefing_date", briefingDate)
        .order("briefing_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const preservedSourceCounts =
      existingTodayRow?.source_counts &&
      typeof existingTodayRow.source_counts === "object" &&
      !Array.isArray(existingTodayRow.source_counts)
        ? (existingTodayRow.source_counts as Record<string, unknown>)
        : {};

    const storedMelusiSourceCounts =
      existingTodayRow?.status === "completed"
        ? extractMelusiExpenseSourceCounts(existingTodayRow.source_counts)
        : extractMelusiExpenseSourceCounts(priorBriefRow?.source_counts);

    const storedFinanceSourceCounts =
      existingTodayRow?.status === "completed"
        ? extractFinanceBriefSourceCounts(existingTodayRow.source_counts)
        : extractFinanceBriefSourceCounts(priorBriefRow?.source_counts);

    const sinceTimestamp =
      typeof existingTodayRow?.generated_at === "string"
        ? existingTodayRow.generated_at
        : typeof priorBriefRow?.generated_at === "string"
          ? priorBriefRow.generated_at
          : undefined;

    const { error: upsertError } = await supabase.from("morning_briefings").upsert(
      {
        user_id: userId,
        briefing_date: briefingDate,
        timezone: timeZone,
        status: "generating",
        content: null,
        safe_error_message: null,
        generated_at: null,
        source_counts: preservedSourceCounts,
      },
      { onConflict: "user_id,briefing_date" },
    );

    if (upsertError) {
      logMorningBriefDiagnostic({
        stage: MORNING_BRIEF_STAGES.contextLoading,
        success: false,
        ...buildSupabaseErrorDiagnostic(upsertError),
        durationMs: Date.now() - contextStartedAt,
      });
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.contextLoading,
      success: true,
      durationMs: Date.now() - contextStartedAt,
    });

    currentStage = MORNING_BRIEF_STAGES.snapshotLoading;
    const snapshotStartedAt = Date.now();

  const [tasksResult, melusiSnapshot, melusiExpenseSnapshotResult, financeSnapshotResult] =
    await Promise.all([
      listMorningBriefTasks(supabase, userId),
      loadMelusiPlanningSnapshot(supabase, userId, { timeZone, now }),
        loadMelusiExpenseBriefSnapshot(supabase, userId, {
          now,
          ...(sinceTimestamp ? { since: sinceTimestamp } : {}),
        }),
        loadFinanceBriefSnapshot(supabase, userId, {
          now,
          ...(sinceTimestamp ? { since: sinceTimestamp } : {}),
        }),
      ]);

    let melusiExpenseContext: MelusiExpenseBriefContext | null = null;

    if (melusiExpenseSnapshotResult.success) {
      melusiExpenseContext = buildMelusiExpenseBriefContext({
        snapshot: melusiExpenseSnapshotResult.snapshot,
        storedSourceCounts: storedMelusiSourceCounts,
        localDate: briefingDate,
      });
    }

    let financeBriefContext: FinanceBriefContext | null = null;
    let financeSourceCounts: FinanceBriefSourceCounts = {
      ...storedFinanceSourceCounts,
      snapshotSuccess: false,
    };

    if (financeSnapshotResult.success) {
      financeBriefContext = buildFinanceBriefContext({
        snapshot: financeSnapshotResult.snapshot,
        storedSourceCounts: storedFinanceSourceCounts,
      });
      financeSourceCounts = financeBriefContext.nextSourceCounts;
    }

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.snapshotLoading,
      success: true,
      durationMs: Date.now() - snapshotStartedAt,
      tasksSuccess: tasksResult.success,
      melusiSnapshotSuccess: melusiExpenseSnapshotResult.success,
      financeSnapshotSuccess: financeSnapshotResult.success,
    });

    console.info("[morning-brief] melusi-expenses", {
      snapshotSuccess: melusiExpenseSnapshotResult.success,
      hasMeaningfulSignals: melusiExpenseContext?.hasMeaningfulSignals ?? false,
      dueSoonCount: melusiExpenseContext?.dueSoonCharges.length ?? 0,
      overdueCount: melusiExpenseContext?.overdueCharges.length ?? 0,
      refundCount: melusiExpenseContext?.recentRefunds.length ?? 0,
      largeExpenseCount: melusiExpenseContext?.recentLargeExpenses.length ?? 0,
      importCount: melusiExpenseContext?.recentImports.length ?? 0,
      needsReviewCount: melusiExpenseContext?.needsReviewCount ?? 0,
      recurringOverheadSummaryIncluded:
        melusiExpenseContext?.recurringOverheadSummary !== null &&
        melusiExpenseContext?.recurringOverheadSummary !== undefined,
    });

    console.info("[morning-brief] finance", {
      snapshotSuccess: financeSnapshotResult.success,
      signalsGenerated: financeSourceCounts.signalsGenerated,
      pendingReviewCount: financeSourceCounts.pendingReviewCount,
      reconnectCount: financeSourceCounts.reconnectCount,
      staleSyncCount: financeSourceCounts.staleSyncCount,
      largeTransactionCount: financeSourceCounts.largeTransactionCount,
      refundCount: financeSourceCounts.refundCount,
      lowCashActive: financeSourceCounts.lowCashActive,
      staleBalanceCount: financeSourceCounts.staleBalanceCount,
      ...(financeSnapshotResult.success
        ? {}
        : { errorCode: financeSnapshotResult.errorCode }),
    });

    const lifeAreaNames = new Map(
      context.lifeAreas.map((lifeArea) => [lifeArea.id, lifeArea.name]),
    );

    const unfinishedTasks = tasksResult.success
      ? prepareMorningBriefTasks(tasksResult.tasks, lifeAreaNames, timeZone, now)
      : [];

    const activeGoals = context.goals.filter((goal) => goal.status === "active");
    const memories = context.memories;
    const planningEndLocal = addDaysToLocalDate(briefingDate, 1);

    currentStage = MORNING_BRIEF_STAGES.outlookCalendarLoading;
    const calendarStartedAt = Date.now();
    const startDateTime = now.toISOString();
    const endDateTime = new Date(
      now.getTime() + 36 * 60 * 60 * 1000,
    ).toISOString();

    let events: BriefingEvent[] = [];
    let calendarNote: string | null = null;

    const calendarResult = await listOutlookCalendar(supabase, userId, {
      startDateTime,
      endDateTime,
      timeZone,
    });

    if (calendarResult.success) {
      events = prepareMorningBriefEvents(calendarResult.events, timeZone);
      if (calendarResult.truncated) {
        calendarNote =
          "Additional calendar events may exist beyond the first page returned.";
      }
    } else if (
      "needsConnection" in calendarResult &&
      calendarResult.needsConnection
    ) {
      calendarNote =
        "Outlook calendar was unavailable because Microsoft 365 is not connected.";
    } else if (
      "needsReconnect" in calendarResult &&
      calendarResult.needsReconnect
    ) {
      calendarNote =
        "Outlook calendar was unavailable because Microsoft 365 needs to be reconnected.";
    } else {
      calendarNote = "Outlook calendar could not be retrieved.";
    }

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.outlookCalendarLoading,
      success: calendarResult.success,
      durationMs: Date.now() - calendarStartedAt,
      calendarSuccess: calendarResult.success,
      eventCount: events.length,
    });

    currentStage = MORNING_BRIEF_STAGES.briefPlanning;
    const planningStartedAt = Date.now();

    const sourceCounts = mergeFinanceBriefSourceCountsIntoRoot(
      mergeMelusiExpenseSourceCountsIntoRoot(
        {
          tasks: unfinishedTasks.length,
          goals: activeGoals.length,
          memories: memories.length,
          emails: 0,
          events: events.length,
          melusiProjects: melusiSnapshot.activeProjects.length,
          melusiProjectTasks: Object.keys(melusiSnapshot.projectNameByTaskId).length,
          melusiProjectUpdates: melusiSnapshot.projectUpdates.length,
        },
        melusiExpenseContext?.nextSourceCounts ?? storedMelusiSourceCounts,
      ),
      financeSourceCounts,
    ) as SourceCounts;

    const instructions = buildMorningBriefInstructions({
      preferredName: context.profile?.preferred_name ?? null,
      timeZone,
      communicationStyle: context.profile?.communication_style ?? null,
    });

    const briefPlan = buildMorningBriefPlan({
      tasks: unfinishedTasks,
      events,
      currentFocus: context.profile?.current_focus ?? null,
      todayLocal: briefingDate,
      planningEndLocal,
    });

    const prompt = buildMorningBriefUserPrompt({
      localDateLabel,
      dateTimeSection: formatDateTimeSection(timeZone, now),
      plan: briefPlan,
      preferredName: context.profile?.preferred_name ?? null,
      tasks: unfinishedTasks,
      events,
      calendarNote,
    });

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.briefPlanning,
      success: true,
      durationMs: Date.now() - planningStartedAt,
    });

    currentStage = MORNING_BRIEF_STAGES.openaiRequest;
    const openAiStartedAt = Date.now();

    if (!process.env.OPENAI_API_KEY) {
      logMorningBriefDiagnostic({
        stage: MORNING_BRIEF_STAGES.openaiRequest,
        success: false,
        failureCategory: OPENAI_FAILURE_CATEGORIES.authenticationConfiguration,
        durationMs: Date.now() - openAiStartedAt,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let response: OpenAI.Responses.Response;

    try {
      response = (await openai.responses.create(
        buildMorningBriefOpenAiRequestParams(instructions, prompt),
      )) as OpenAI.Responses.Response;
    } catch (error) {
      logMorningBriefOpenAiFailure(error, {
        durationMs: Date.now() - openAiStartedAt,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    const openAiEvaluation = evaluateMorningBriefOpenAiResponse(response);

    if (openAiEvaluation.kind === "incomplete") {
      logMorningBriefIncompleteResponse({
        durationMs: Date.now() - openAiStartedAt,
        ...openAiEvaluation.diagnostic,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.openaiRequest,
      success: true,
      durationMs: Date.now() - openAiStartedAt,
      responseStatus: openAiEvaluation.diagnostic.responseStatus,
      outputTokens: openAiEvaluation.diagnostic.outputTokens,
      reasoningTokens: openAiEvaluation.diagnostic.reasoningTokens,
      extractedLength: openAiEvaluation.diagnostic.extractedLength,
    });

    currentStage = MORNING_BRIEF_STAGES.responseExtraction;
    const extractionStartedAt = Date.now();

    if (openAiEvaluation.kind === "empty") {
      logMorningBriefEmptyOutput(EMPTY_OUTPUT_REASONS.emptyExtractedText, {
        durationMs: Date.now() - extractionStartedAt,
        extractedLength: 0,
        responseStatus: openAiEvaluation.diagnostic.responseStatus,
        outputTokens: openAiEvaluation.diagnostic.outputTokens,
        reasoningTokens: openAiEvaluation.diagnostic.reasoningTokens,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    const extractedText = openAiEvaluation.extractedText;

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.responseExtraction,
      success: true,
      durationMs: Date.now() - extractionStartedAt,
      extractedLength: extractedText.length,
      responseStatus: openAiEvaluation.diagnostic.responseStatus,
      outputTokens: openAiEvaluation.diagnostic.outputTokens,
      reasoningTokens: openAiEvaluation.diagnostic.reasoningTokens,
    });

    currentStage = MORNING_BRIEF_STAGES.spokenTextNormalization;
    const normalizationStartedAt = Date.now();
    const normalizedSpokenContent = finalizeMorningBriefSpokenText(
      extractedText,
      context.profile?.preferred_name ?? null,
    );

    if (!normalizedSpokenContent) {
      logMorningBriefEmptyOutput(EMPTY_OUTPUT_REASONS.normalizationRemovedAll, {
        durationMs: Date.now() - normalizationStartedAt,
        extractedLength: extractedText.length,
        normalizedLength: 0,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    const recommendedMode = resolveMorningBriefRecommendedModeFromPriority({
      topPriority: briefPlan.topPriority,
      tasks: unfinishedTasks,
      currentFocus: context.profile?.current_focus ?? null,
      melusiProjectTaskIds: new Set(
        Object.keys(melusiSnapshot.projectNameByTaskId),
      ),
    });

    const { content, metadata: recommendationMetadata } =
      finalizeMorningBriefRecommendation({
        content: normalizedSpokenContent,
        recommendedMode,
      });

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.spokenTextNormalization,
      success: true,
      durationMs: Date.now() - normalizationStartedAt,
      extractedLength: extractedText.length,
      normalizedLength: content.length,
    });

    const canonicalPriorityText = getCanonicalPriorityTextFromPlan(briefPlan);

    if (!validateBriefPriorityTextPresence(content, canonicalPriorityText)) {
      logMorningBriefDiagnostic({
        stage: MORNING_BRIEF_STAGES.spokenTextNormalization,
        success: false,
        durationMs: Date.now() - normalizationStartedAt,
        extractedLength: extractedText.length,
        normalizedLength: content.length,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    currentStage = MORNING_BRIEF_STAGES.briefingUpdate;
    const updateStartedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const finalSourceCounts = mergeBriefDisplayIntoSourceCounts(sourceCounts, {
      priorityText: canonicalPriorityText,
    });

    const { error: updateError } = await supabase
      .from("morning_briefings")
      .update({
        status: "completed",
        content,
        generated_at: generatedAt,
        source_counts: finalSourceCounts,
        safe_error_message: null,
        recommended_mode: recommendationMetadata?.recommendedMode ?? null,
        recommendation_sentence_index:
          recommendationMetadata?.recommendationSentenceIndex ?? null,
      })
      .eq("user_id", userId)
      .eq("briefing_date", briefingDate);

    if (updateError) {
      logMorningBriefSupabaseUpdateFailure(updateError, {
        durationMs: Date.now() - updateStartedAt,
      });
      await markBriefingFailed(supabase, userId, briefingDate);
      return { success: false, error: SAFE_ERROR_MESSAGE };
    }

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.briefingUpdate,
      success: true,
      durationMs: Date.now() - updateStartedAt,
    });

    try {
      await generateMorningBriefAudio({
        userId,
        briefingDate,
        normalizedSpokenContent: content,
      });
    } catch {
      console.info("[morning-brief-audio]", {
        stage: "unexpected_error",
        resultCode: "unexpected_error",
      });
    }

    return { success: true, briefingDate };
  } catch (error) {
    logMorningBriefStageFailure(currentStage, error, {
      durationMs: Date.now() - generationStartedAt,
    });

    if (briefingDate) {
      await markBriefingFailed(supabase, userId, briefingDate);
    }

    return { success: false, error: SAFE_ERROR_MESSAGE };
  }
}
