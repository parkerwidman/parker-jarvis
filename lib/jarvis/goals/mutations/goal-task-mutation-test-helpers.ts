import { vi } from "vitest";

export const USER_ID = "99999999-9999-4999-8999-999999999999";
export const OTHER_USER_ID = "88888888-8888-4888-8888-888888888888";
export const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export type QueryFilters = Record<string, unknown>;

export type TaskRow = {
  id: string;
  goal_id: string | null;
  goal_level_id: string | null;
  status: string;
  completed_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  notes: string | null;
};

function trackFilter(filters: QueryFilters, method: string, args: unknown[]) {
  if (method === "eq") {
    filters[`eq:${String(args[0])}`] = args[1];
  }
  if (method === "neq") {
    filters[`neq:${String(args[0])}`] = args[1];
  }
  if (method === "is") {
    filters[`is:${String(args[0])}`] = args[1];
  }
  if (method === "not") {
    filters[`not:${String(args[0])}:${String(args[1])}`] = args[2];
  }
}

function createQueryChain(
  filters: QueryFilters,
  terminal: () => Promise<{ data: unknown; error: Error | null }>,
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  for (const method of ["eq", "neq", "is", "not"] as const) {
    chain[method] = vi.fn((...args: unknown[]) => {
      trackFilter(filters, method, args);
      return chain;
    });
  }

  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => terminal());

  return chain;
}

type ScopedSupabaseMockOptions = {
  task?: TaskRow | null;
  taskError?: Error | null;
  goal?: { id: string; status: string } | null;
  goalError?: Error | null;
  level?: { id: string; goal_id: string; name?: string } | null;
  levelError?: Error | null;
  updateResult?: (filters: QueryFilters, payload: Record<string, unknown>) => unknown | null;
  updateError?: Error | null;
  rereadTask?: { status: string; blocked_at: string | null } | null;
};

export function createScopedSupabaseMock(options: ScopedSupabaseMockOptions = {}) {
  const loadFilters: QueryFilters[] = [];
  const updateFilters: QueryFilters[] = [];
  const updatePayloads: Record<string, unknown>[] = [];
  let updateCallCount = 0;

  const from = vi.fn((table: string) => {
    if (table === "tasks") {
      return {
        select: vi.fn((columns?: string) => {
          const filters: QueryFilters = {};
          loadFilters.push(filters);

          if (columns === "status, blocked_at") {
            return createQueryChain(filters, async () => ({
              data: options.rereadTask ?? null,
              error: null,
            }));
          }

          return createQueryChain(filters, async () => ({
            data: options.task ?? null,
            error: options.taskError ?? null,
          }));
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateCallCount += 1;
          updatePayloads.push(payload);
          const filters: QueryFilters = {};
          updateFilters.push(filters);

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

            return {
              data: {
                id: TASK_ID,
                notes: "notes" in payload ? payload.notes : undefined,
                blocked_at:
                  "blocked_at" in payload
                    ? payload.blocked_at
                    : options.task?.blocked_at ?? null,
                blocked_reason:
                  "blocked_reason" in payload
                    ? payload.blocked_reason
                    : options.task?.blocked_reason ?? null,
              },
              error: null,
            };
          });
        }),
      };
    }

    if (table === "jarvis_goals") {
      const filters: QueryFilters = {};
      loadFilters.push(filters);
      return {
        select: vi.fn(() =>
          createQueryChain(filters, async () => ({
            data: options.goal ?? { id: GOAL_ID, status: "active" },
            error: options.goalError ?? null,
          })),
        ),
      };
    }

    if (table === "jarvis_goal_levels") {
      const filters: QueryFilters = {};
      loadFilters.push(filters);
      return {
        select: vi.fn(() =>
          createQueryChain(filters, async () => ({
            data: options.level ?? { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
            error: options.levelError ?? null,
          })),
        ),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateCallCount += 1;
          updatePayloads.push(payload);
          const updateChainFilters: QueryFilters = {};
          updateFilters.push(updateChainFilters);

          return createQueryChain(updateChainFilters, async () => {
            if (options.updateError) {
              return { data: null, error: options.updateError };
            }

            const data = options.updateResult?.(updateChainFilters, payload);

            if (data === null) {
              return { data: null, error: null };
            }

            if (data !== undefined) {
              return { data, error: null };
            }

            return {
              data: {
                id: LEVEL_ID,
                name: "name" in payload ? payload.name : "Foundation",
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
    loadFilters,
    updateFilters,
    updatePayloads,
    get updateCallCount() {
      return updateCallCount;
    },
  };
}

export const baseTask: TaskRow = {
  id: TASK_ID,
  goal_id: GOAL_ID,
  goal_level_id: LEVEL_ID,
  status: "todo",
  completed_at: null,
  blocked_at: null,
  blocked_reason: null,
  notes: null,
};
