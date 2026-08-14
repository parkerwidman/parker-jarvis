export type ToolExecutionSafety = "read" | "write" | "unknown";

const READ_ONLY_TOOLS = new Set<string>([
  "list_tasks",
  "list_projects",
  "list_project_updates",
  "list_outlook_inbox",
  "list_outlook_calendar",
  "get_melusi_social_performance",
  "get_melusi_expenses",
  "get_personal_finance_summary",
  "get_personal_spending",
  "get_personal_recurring_charges",
  "get_schedule_for_date",
  "get_schedule_for_week",
  "get_schedule_periods",
  "find_schedule_open_windows",
]);

export function classifyToolExecutionSafety(toolName: string): ToolExecutionSafety {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return "read";
  }

  return "write";
}

export type ToolCallBatchItem<T> = {
  toolName: string;
  safety: ToolExecutionSafety;
  value: T;
};

export type ToolCallExecutionSegment<TInput, TOutput> =
  | {
      kind: "parallel-read";
      items: Array<ToolCallBatchItem<TInput>>;
    }
  | {
      kind: "sequential";
      items: Array<ToolCallBatchItem<TInput>>;
    };

export function buildToolExecutionSegments<T>(
  calls: T[],
  getToolName: (call: T) => string,
): Array<ToolCallExecutionSegment<T, unknown>> {
  const segments: Array<ToolCallExecutionSegment<T, unknown>> = [];
  let currentReadBatch: Array<ToolCallBatchItem<T>> = [];

  const flushReadBatch = () => {
    if (currentReadBatch.length === 0) {
      return;
    }

    segments.push({
      kind: "parallel-read",
      items: currentReadBatch,
    });
    currentReadBatch = [];
  };

  for (const call of calls) {
    const toolName = getToolName(call);
    const safety = classifyToolExecutionSafety(toolName);
    const item = { toolName, safety, value: call };

    if (safety === "read") {
      currentReadBatch.push(item);
      continue;
    }

    flushReadBatch();
    segments.push({
      kind: "sequential",
      items: [item],
    });
  }

  flushReadBatch();

  return segments;
}

export async function executeToolSegmentsInOrder<TCall, TResult>(input: {
  calls: TCall[];
  getToolName: (call: TCall) => string;
  executeCall: (call: TCall) => Promise<TResult>;
}): Promise<Array<{ call: TCall; result: TResult }>> {
  const segments = buildToolExecutionSegments(input.calls, input.getToolName);
  const results = new Map<TCall, TResult>();

  for (const segment of segments) {
    if (segment.kind === "parallel-read") {
      const settled = await Promise.allSettled(
        segment.items.map(async (item) => ({
          call: item.value,
          result: await input.executeCall(item.value),
        })),
      );

      for (const [index, outcome] of settled.entries()) {
        const call = segment.items[index]?.value;

        if (!call) {
          continue;
        }

        if (outcome.status === "fulfilled") {
          results.set(call, outcome.value.result);
          continue;
        }

        throw outcome.reason;
      }

      continue;
    }

    for (const item of segment.items) {
      results.set(item.value, await input.executeCall(item.value));
    }
  }

  return input.calls.map((call) => ({
    call,
    result: results.get(call)!,
  }));
}
