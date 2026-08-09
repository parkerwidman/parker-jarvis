import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadGoals } from "./load-goals";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRIORITY_GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type QueryCall = {
  table: string;
  filters: Array<[string, string]>;
  orders: Array<[string, { ascending: boolean; nullsFirst?: boolean }]>;
};

function createGoalsSupabaseMock(goalType: string) {
  const calls: QueryCall[] = [];

  function createChain(table: string, result: unknown) {
    const queryCall: QueryCall = { table, filters: [], orders: [] };
    calls.push(queryCall);

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: string) => {
      queryCall.filters.push([column, value]);
      return chain;
    });
    chain.neq = vi.fn((column: string, value: string) => {
      queryCall.filters.push([column, value]);
      return chain;
    });
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(
      (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
        queryCall.orders.push([
          column,
          {
            ascending: options?.ascending ?? true,
            nullsFirst: options?.nullsFirst,
          },
        ]);
        return chain;
      },
    );
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);

    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "jarvis_profiles") {
        return createChain(table, {
          data: { today_priority_goal_id: PRIORITY_GOAL_ID },
          error: null,
        });
      }

      if (table === "jarvis_goals") {
        return createChain(table, {
          data: [
            {
              id: PRIORITY_GOAL_ID,
              title: "Priority goal",
              description: null,
              domain: "personal",
              status: "active",
              sort_order: 0,
              completed_at: null,
              created_at: "2026-08-08T00:00:00.000Z",
            },
          ],
          error: null,
        });
      }

      if (table === "jarvis_goal_levels") {
        return createChain(table, {
          data: [
            {
              id: "level-1",
              name: "Level 1",
              position: 1,
              goal_id: PRIORITY_GOAL_ID,
            },
          ],
          error: null,
        });
      }

      if (table === "tasks") {
        return createChain(table, {
          data: [
            {
              id: "task-1",
              title: "Task",
              status: "todo",
              position: 1,
              notes: null,
              blocked_at: null,
              blocked_reason: null,
              goal_level_id: "level-1",
            },
          ],
          error: null,
        });
      }

      return createChain(table, { data: [], error: null });
    }),
  };

  return { supabase, calls, goalType };
}

describe("loadGoals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["short_term", "short_term"],
    ["three_month", "three_month"],
    ["long_term", "long_term"],
  ] as const)("A-C. requests only %s goals for the %s route", async (goalType, expected) => {
    const { supabase, calls } = createGoalsSupabaseMock(goalType);
    await loadGoals(supabase as never, USER_ID, goalType);

    const goalQuery = calls.find((call) => call.table === "jarvis_goals");
    expect(goalQuery?.filters).toContainEqual(["goal_type", expected]);
    expect(goalQuery?.filters).toContainEqual(["user_id", USER_ID]);
  });

  it("O. marks the matching short-term goal as today's priority", async () => {
    const { supabase } = createGoalsSupabaseMock("short_term");
    const data = await loadGoals(supabase as never, USER_ID, "short_term");

    expect(data.todayPriorityGoalId).toBe(PRIORITY_GOAL_ID);
    expect(data.goals[0]?.isTodayPriority).toBe(true);
  });

  it("Z. does not mark completed goals as today's priority even when profile id matches", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: { today_priority_goal_id: PRIORITY_GOAL_ID },
          error: null,
        }));
        chain.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve(
            table === "jarvis_goals"
              ? {
                  data: [
                    {
                      id: PRIORITY_GOAL_ID,
                      title: "Completed priority",
                      description: null,
                      domain: "personal",
                      status: "completed",
                      sort_order: 0,
                      completed_at: "2026-08-08T00:00:00.000Z",
                      created_at: "2026-08-08T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }
              : table === "jarvis_goal_levels"
                ? { data: [], error: null }
                : { data: [], error: null },
          ).then(onFulfilled);

        return chain;
      }),
    };

    const data = await loadGoals(supabase as never, USER_ID, "short_term");

    expect(data.todayPriorityGoalId).toBe(PRIORITY_GOAL_ID);
    expect(data.goals[0]?.isTodayPriority).toBe(false);
  });

  it("T. performs read-only selects without insert/update/delete calls", async () => {
    const { supabase } = createGoalsSupabaseMock("short_term");
    await loadGoals(supabase as never, USER_ID, "short_term");

    expect(supabase.from).toHaveBeenCalled();
    for (const call of supabase.from.mock.calls) {
      expect(["jarvis_profiles", "jarvis_goals", "jarvis_goal_levels", "tasks"]).toContain(
        call[0],
      );
    }
  });

  it("R. returns an empty goals array cleanly when none exist", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: { today_priority_goal_id: null },
          error: null,
        }));
        chain.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve(
            table === "jarvis_goals"
              ? { data: [], error: null }
              : { data: null, error: null },
          ).then(onFulfilled);

        return chain;
      }),
    };

    const data = await loadGoals(supabase as never, USER_ID, "short_term");
    expect(data.goals).toEqual([]);
  });
});
