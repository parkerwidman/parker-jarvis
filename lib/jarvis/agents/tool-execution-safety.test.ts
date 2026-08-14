import { describe, expect, it, vi } from "vitest";

import {
  buildToolExecutionSegments,
  classifyToolExecutionSafety,
  executeToolSegmentsInOrder,
} from "@/lib/jarvis/agents/tool-execution-safety";

describe("classifyToolExecutionSafety", () => {
  it("classifies known read-only tools", () => {
    expect(classifyToolExecutionSafety("list_tasks")).toBe("read");
    expect(classifyToolExecutionSafety("get_schedule_for_date")).toBe("read");
  });

  it("treats writes and unknown tools conservatively", () => {
    expect(classifyToolExecutionSafety("create_task")).toBe("write");
    expect(classifyToolExecutionSafety("confirm_pending_schedule_action")).toBe(
      "write",
    );
    expect(classifyToolExecutionSafety("totally_unknown_tool")).toBe("write");
  });
});

describe("buildToolExecutionSegments", () => {
  it("groups contiguous reads and splits around writes", () => {
    const segments = buildToolExecutionSegments(
      [
        "list_tasks",
        "get_schedule_for_date",
        "create_task",
        "list_outlook_inbox",
        "find_schedule_open_windows",
      ],
      (call) => call,
    );

    expect(segments).toEqual([
      {
        kind: "parallel-read",
        items: [
          { toolName: "list_tasks", safety: "read", value: "list_tasks" },
          {
            toolName: "get_schedule_for_date",
            safety: "read",
            value: "get_schedule_for_date",
          },
        ],
      },
      {
        kind: "sequential",
        items: [{ toolName: "create_task", safety: "write", value: "create_task" }],
      },
      {
        kind: "parallel-read",
        items: [
          {
            toolName: "list_outlook_inbox",
            safety: "read",
            value: "list_outlook_inbox",
          },
          {
            toolName: "find_schedule_open_windows",
            safety: "read",
            value: "find_schedule_open_windows",
          },
        ],
      },
    ]);
  });
});

describe("executeToolSegmentsInOrder", () => {
  it("executes read batches concurrently and writes sequentially", async () => {
    vi.useFakeTimers();

    const order: string[] = [];
    const calls = [
      { name: "list_tasks", id: "1" },
      { name: "get_schedule_for_date", id: "2" },
      { name: "create_task", id: "3" },
    ];

    const executePromise = executeToolSegmentsInOrder({
      calls,
      getToolName: (call) => call.name,
      executeCall: async (call) => {
        order.push(`start:${call.id}`);
        await new Promise((resolve) => {
          setTimeout(resolve, call.name.startsWith("create") ? 10 : 100);
        });
        order.push(`end:${call.id}`);
        return `result:${call.id}`;
      },
    });

    await vi.runAllTimersAsync();
    const results = await executePromise;

    expect(order.indexOf("start:1")).toBeLessThan(order.indexOf("end:3"));
    expect(order.indexOf("start:2")).toBeLessThan(order.indexOf("end:3"));
    expect(order.indexOf("end:1")).toBeLessThan(order.indexOf("start:3"));
    expect(order.indexOf("end:2")).toBeLessThan(order.indexOf("start:3"));
    expect(results.map((entry) => entry.result)).toEqual([
      "result:1",
      "result:2",
      "result:3",
    ]);

    vi.useRealTimers();
  });

  it("preserves original call order in returned results", async () => {
    const results = await executeToolSegmentsInOrder({
      calls: [
        { name: "list_tasks", id: "a" },
        { name: "list_outlook_inbox", id: "b" },
      ],
      getToolName: (call) => call.name,
      executeCall: async (call) => call.id,
    });

    expect(results.map((entry) => entry.call.id)).toEqual(["a", "b"]);
  });
});
