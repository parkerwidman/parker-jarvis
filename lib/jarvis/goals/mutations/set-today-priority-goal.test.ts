import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearJarvisTodayPriorityGoal,
  setJarvisTodayPriorityGoal,
} from "./set-today-priority-goal";

const USER_ID = "99999999-9999-4999-8999-999999999999";
const GOAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_GOAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type QueryFilters = Record<string, unknown>;

type PriorityMockOptions = {
  goal?: { id: string; goal_type: string; status: string } | null;
  goalError?: Error | null;
  profile?: {
    today_priority_goal_id: string | null;
    current_focus: string | null;
  } | null;
  profileReadError?: Error | null;
  updateError?: Error | null;
  updateResult?: (
    filters: QueryFilters,
    payload: Record<string, unknown>,
  ) => { today_priority_goal_id: string | null; current_focus: string | null } | null;
};

function createPrioritySupabaseMock(options: PriorityMockOptions = {}) {
  const goalFilters: QueryFilters[] = [];
  const profileReadFilters: QueryFilters[] = [];
  const profileUpdateFilters: QueryFilters[] = [];
  const updatePayloads: Record<string, unknown>[] = [];
  let profileUpdateCallCount = 0;

  function trackFilter(filters: QueryFilters, method: string, args: unknown[]) {
    if (method === "eq") {
      filters[`eq:${String(args[0])}`] = args[1];
    }
  }

  function createQueryChain(
    filters: QueryFilters,
    terminal: () => Promise<{ data: unknown; error: Error | null }>,
  ) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    chain.eq = vi.fn((...args: unknown[]) => {
      trackFilter(filters, "eq", args);
      return chain;
    });
    chain.select = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => terminal());

    return chain;
  }

  const from = vi.fn((table: string) => {
    if (table === "jarvis_goals") {
      const filters: QueryFilters = {};
      goalFilters.push(filters);
      return {
        select: vi.fn(() =>
          createQueryChain(filters, async () => ({
            data:
              options.goal !== undefined
                ? options.goal
                : {
                    id: GOAL_A,
                    goal_type: "short_term",
                    status: "active",
                  },
            error: options.goalError ?? null,
          })),
        ),
      };
    }

    if (table === "jarvis_profiles") {
      return {
        select: vi.fn(() => {
          const filters: QueryFilters = {};
          profileReadFilters.push(filters);
          return createQueryChain(filters, async () => ({
            data:
              options.profile ??
              ({
                today_priority_goal_id: null,
                current_focus: "Keep shipping",
              } as const),
            error: options.profileReadError ?? null,
          }));
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          profileUpdateCallCount += 1;
          updatePayloads.push(payload);
          const filters: QueryFilters = {};
          profileUpdateFilters.push(filters);

          return createQueryChain(filters, async () => {
            if (options.updateError) {
              return { data: null, error: options.updateError };
            }

            const data = options.updateResult?.(filters, payload);

            if (data === null) {
              return { data: null, error: null };
            }

            if (data !== undefined) {
              return { data, error: null };
            }

            const currentFocus =
              options.profile?.current_focus ?? "Keep shipping";

            return {
              data: {
                today_priority_goal_id:
                  "today_priority_goal_id" in payload
                    ? (payload.today_priority_goal_id as string | null)
                    : options.profile?.today_priority_goal_id ?? null,
                current_focus: currentFocus,
              },
              error: null,
            };
          });
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    supabase: { from } as never,
    from,
    goalFilters,
    profileReadFilters,
    profileUpdateFilters,
    updatePayloads,
    get profileUpdateCallCount() {
      return profileUpdateCallCount;
    },
  };
}

describe("setJarvisTodayPriorityGoal", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("A. rejects unauthenticated user before DB call", async () => {
    const mock = createPrioritySupabaseMock();

    const result = await setJarvisTodayPriorityGoal(mock.supabase, null, GOAL_A);

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update Today's Priority.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("C. rejects invalid UUID goalId", async () => {
    const mock = createPrioritySupabaseMock();

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, "not-a-uuid");

    expect(result).toEqual({ success: false, error: "Invalid goal." });
    expect(mock.profileUpdateCallCount).toBe(0);
  });

  it("D. rejects non-string goalId", async () => {
    const mock = createPrioritySupabaseMock();

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, 123);

    expect(result).toEqual({ success: false, error: "Invalid goal." });
    expect(mock.profileUpdateCallCount).toBe(0);
  });

  it("G. scopes goal query by id and user_id", async () => {
    const mock = createPrioritySupabaseMock();

    await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    expect(mock.goalFilters[0]).toEqual({
      "eq:id": GOAL_A,
      "eq:user_id": USER_ID,
    });
  });

  it("H. rejects another user's goal when not found", async () => {
    const mock = createPrioritySupabaseMock({ goal: null });

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, OTHER_GOAL);

    expect(result).toEqual({ success: false, error: "Goal not found." });
    expect(mock.profileUpdateCallCount).toBe(0);
  });

  it("I. scopes profile UPDATE by user_id", async () => {
    const mock = createPrioritySupabaseMock();

    await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    expect(mock.profileUpdateFilters[0]).toEqual({ "eq:user_id": USER_ID });
  });

  it.each([
    ["short_term", "active", true],
    ["three_month", "active", false],
    ["long_term", "active", false],
    ["short_term", "completed", false],
    ["short_term", "archived", false],
  ] as const)(
    "J-N. %s %s goal acceptance=%s",
    async (goalType, status, accepted) => {
      const mock = createPrioritySupabaseMock({
        goal: { id: GOAL_A, goal_type: goalType, status },
      });

      const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

      if (accepted) {
        expect(result).toEqual({ success: true, goalId: GOAL_A });
        expect(mock.profileUpdateCallCount).toBe(1);
      } else {
        expect(result.success).toBe(false);
        expect(mock.profileUpdateCallCount).toBe(0);
      }
    },
  );

  it("O. updates only today_priority_goal_id and updated_at", async () => {
    const mock = createPrioritySupabaseMock();

    await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    expect(mock.updatePayloads[0]).toEqual({
      today_priority_goal_id: GOAL_A,
      updated_at: expect.any(String),
    });
    expect(Object.keys(mock.updatePayloads[0] ?? {})).toEqual([
      "today_priority_goal_id",
      "updated_at",
    ]);
  });

  it("P. preserves current_focus on profile UPDATE", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: null,
        current_focus: "Keep shipping",
      },
      updateResult: (_filters, payload) => ({
        today_priority_goal_id: payload.today_priority_goal_id as string,
        current_focus: "Keep shipping",
      }),
    });

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    expect(result.success).toBe(true);
    expect(mock.updatePayloads[0]).not.toHaveProperty("current_focus");
  });

  it("Q. replaces prior priority goal when setting Goal B", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: GOAL_A,
        current_focus: "Keep shipping",
      },
      goal: { id: GOAL_B, goal_type: "short_term", status: "active" },
    });

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_B);

    expect(result).toEqual({ success: true, goalId: GOAL_B });
    expect(mock.updatePayloads[0]?.today_priority_goal_id).toBe(GOAL_B);
  });

  it("R. selecting the same goal is idempotent", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: GOAL_A,
        current_focus: "Keep shipping",
      },
    });

    const result = await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    expect(result).toEqual({ success: true, goalId: GOAL_A });
    expect(mock.profileUpdateCallCount).toBe(0);
  });

  it("AG. set payload does not include current_focus", async () => {
    const mock = createPrioritySupabaseMock();

    await setJarvisTodayPriorityGoal(mock.supabase, USER_ID, GOAL_A);

    for (const payload of mock.updatePayloads) {
      expect(payload).not.toHaveProperty("current_focus");
    }
  });
});

describe("clearJarvisTodayPriorityGoal", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("B. rejects unauthenticated user before DB call", async () => {
    const mock = createPrioritySupabaseMock();

    const result = await clearJarvisTodayPriorityGoal(mock.supabase, null);

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update Today's Priority.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("I. scopes profile UPDATE by user_id", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: GOAL_A,
        current_focus: "Keep shipping",
      },
    });

    await clearJarvisTodayPriorityGoal(mock.supabase, USER_ID);

    expect(mock.profileUpdateFilters[0]).toEqual({ "eq:user_id": USER_ID });
  });

  it("S. clears today_priority_goal_id", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: GOAL_A,
        current_focus: "Keep shipping",
      },
    });

    const result = await clearJarvisTodayPriorityGoal(mock.supabase, USER_ID);

    expect(result).toEqual({ success: true });
    expect(mock.updatePayloads[0]).toEqual({
      today_priority_goal_id: null,
      updated_at: expect.any(String),
    });
  });

  it("T. already-null clear is idempotent", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: null,
        current_focus: "Keep shipping",
      },
    });

    const result = await clearJarvisTodayPriorityGoal(mock.supabase, USER_ID);

    expect(result).toEqual({ success: true });
    expect(mock.profileUpdateCallCount).toBe(0);
  });

  it("U. preserves current_focus on clear", async () => {
    const mock = createPrioritySupabaseMock({
      profile: {
        today_priority_goal_id: GOAL_A,
        current_focus: "Keep shipping",
      },
    });

    await clearJarvisTodayPriorityGoal(mock.supabase, USER_ID);

    expect(mock.updatePayloads[0]).not.toHaveProperty("current_focus");
  });
});
