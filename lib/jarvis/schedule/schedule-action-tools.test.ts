import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIN_JARVIS_AGENT,
  MELUSI_JARVIS_AGENT,
} from "@/lib/jarvis/agents/agent-registry";
import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import { createInteractiveMainJarvisContext } from "@/lib/jarvis/agents/tool-execution-context";
import { executeJarvisTool } from "@/lib/jarvis/agents/tool-executor";
import {
  MAIN_JARVIS_TOOLS,
  MELUSI_JARVIS_TOOLS,
} from "@/lib/jarvis/agents/tool-definitions";
import {
  buildCreateScheduleMutationPlan,
  buildDeleteScheduleMutationPlan,
  buildSaveScheduleMutationPlan,
} from "@/lib/jarvis/schedule/schedule-mutation-plan";
import {
  cancelPendingScheduleAction,
  confirmPendingScheduleAction,
  createPendingScheduleAction,
  loadActiveMainPendingScheduleAction,
} from "@/lib/jarvis/schedule/pending-schedule-actions";
import {
  PENDING_SCHEDULE_ACTION_VERSION,
} from "@/lib/jarvis/schedule/pending-schedule-action-types";

const USER_A = "11111111-1111-4111-8111-111111111111";

function buildPendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pending-1",
    user_id: USER_A,
    action_type: "add",
    status: "pending",
    summary: "Add test block",
    payload: {
      version: PENDING_SCHEDULE_ACTION_VERSION,
      actionType: "add",
      scheduleId: "schedule-1",
      execution: buildCreateScheduleMutationPlan("one_time", {
        scheduleId: "schedule-1",
        title: "Test",
        category: "work",
        occurrenceDate: "2026-08-25",
        dayOfWeek: 1,
        startTime: "13:00",
        endTime: "13:30",
        isOpenEnded: false,
        notes: null,
      }),
      mutation: {
        kind: "create_one_off",
        input: {
          scheduleId: "schedule-1",
          title: "Test",
          category: "work",
          occurrenceDate: "2026-08-25",
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "13:30",
          isOpenEnded: false,
          notes: null,
        },
      },
    },
    agent_key: "main",
    thread_id: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    confirmed_at: null,
    executed_at: null,
    result: null,
    safe_error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildSupabaseMock() {
  let rows = [buildPendingRow()];
  let rpcCalls = 0;

  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          return builder;
        },
        insert(value: Record<string, unknown>) {
          if (table === "jarvis_pending_schedule_actions") {
            rows = [
              buildPendingRow({
                id: "pending-2",
                ...value,
              }),
            ];
          }
          return {
            select() {
              return {
                single: async () => ({ data: { id: "pending-2" }, error: null }),
              };
            },
          };
        },
        update(value: Record<string, unknown>) {
          return {
            eq(column: string, match: unknown) {
              filters[column] = match;
              return {
                eq() {
                  return builder;
                },
                gt() {
                  return builder;
                },
                lte() {
                  return builder;
                },
                select() {
                  return {
                    maybeSingle: async () => {
                      const row = rows.find(
                        (entry) =>
                          entry.id === filters.id &&
                          entry.user_id === filters.user_id,
                      );

                      if (!row) {
                        return { data: null, error: null };
                      }

                      Object.assign(row, value);
                      return { data: row, error: null };
                    },
                  };
                },
                then(onFulfilled: (value: unknown) => unknown) {
                  rows = rows.map((row) =>
                    row.user_id === filters.user_id && row.status === "pending"
                      ? { ...row, ...value }
                      : row,
                  );
                  return Promise.resolve(onFulfilled({ data: null, error: null }));
                },
              };
            },
          };
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        gt() {
          return builder;
        },
        lte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle: async () => {
          if (table === "jarvis_pending_schedule_actions") {
            const row = rows.find((entry) => {
              if (filters.id && entry.id !== filters.id) {
                return false;
              }
              if (filters.user_id && entry.user_id !== filters.user_id) {
                return false;
              }
              if (filters.status && entry.status !== filters.status) {
                return false;
              }
              return true;
            });

            return { data: row ?? null, error: null };
          }

          return { data: null, error: null };
        },
        then(onFulfilled: (value: unknown) => unknown) {
          return Promise.resolve(onFulfilled({ data: rows, error: null }));
        },
      };

      return builder;
    },
    rpc(name: string) {
      rpcCalls += 1;
      if (name === "jarvis_schedule_execute_pending_action") {
        return Promise.resolve({
          data: {
            success: true,
            summary: "Add test block",
          },
          error: null,
        });
      }

      if (name.startsWith("jarvis_schedule_")) {
        return Promise.resolve({ data: { success: true }, error: null });
      }

      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    },
    get rpcCalls() {
      return rpcCalls;
    },
  };

  return supabase;
}

describe("schedule action tool registration", () => {
  it("registers proposal and confirmation tools on Main Jarvis only", () => {
    const mainNames = MAIN_JARVIS_TOOLS.map((tool) => tool.name);

    expect(mainNames).toContain("propose_add_schedule_item");
    expect(mainNames).toContain("propose_update_schedule_item");
    expect(mainNames).toContain("propose_move_schedule_item");
    expect(mainNames).toContain("propose_remove_schedule_item");
    expect(mainNames).toContain("propose_skip_schedule_occurrence");
    expect(mainNames).toContain("confirm_pending_schedule_action");
    expect(mainNames).toContain("cancel_pending_schedule_action");
    expect(MAIN_JARVIS_AGENT.toolGroups).toContain("schedule");
  });

  it("does not register schedule write tools on Melusi Jarvis", () => {
    const melusiNames = MELUSI_JARVIS_TOOLS.map((tool) => tool.name);

    expect(melusiNames).not.toContain("propose_add_schedule_item");
    expect(melusiNames).not.toContain("confirm_pending_schedule_action");
    expect(MELUSI_JARVIS_AGENT.toolGroups).not.toContain("schedule");
  });
});

describe("Main Jarvis schedule mutation instructions", () => {
  it("documents in-chat confirmation flow", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Schedule chat mutations");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("confirm_pending_schedule_action");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("do not use /approvals");
  });
});

describe("pending schedule action service", () => {
  it("creates pending actions without executing mutations", async () => {
    const supabase = buildSupabaseMock() as never;
    const payload = buildPendingRow().payload;

    const created = await createPendingScheduleAction(supabase, USER_A, {
      actionType: "add",
      summary: "Add test block",
      payload,
    });

    expect(created.success).toBe(true);
    expect(supabase.rpcCalls).toBe(0);
  });

  it("supersedes the previous Main pending action", async () => {
    const supabase = buildSupabaseMock() as never;
    const payload = buildPendingRow().payload;

    await createPendingScheduleAction(supabase, USER_A, {
      actionType: "add",
      summary: "First",
      payload,
    });

    const active = await loadActiveMainPendingScheduleAction(supabase, USER_A);
    expect(active?.summary).toBe("First");
  });

  it("confirms using stored payload only", async () => {
    const supabase = buildSupabaseMock() as never;
    const result = await confirmPendingScheduleAction(supabase, USER_A, "pending-1");

    expect(result.success).toBe(true);
    expect(supabase.rpcCalls).toBeGreaterThan(0);
  });

  it("cancels without mutation", async () => {
    const supabase = buildSupabaseMock() as never;
    const result = await cancelPendingScheduleAction(supabase, USER_A, "pending-1");

    expect(result.success).toBe(true);
  });
});

describe("schedule mutation plan builder", () => {
  it("maps occurrence move to skip plus add RPC plan", () => {
    const plan = buildSaveScheduleMutationPlan(
      {
        scheduleId: "schedule-1",
        scheduleItemId: "item-1",
        overrideId: null,
        source: "recurring",
        occurrenceKey: "key",
        weekdayLabel: "MON",
        title: "Legs",
        category: "gym",
        occurrenceDate: "2026-08-24",
        dayOfWeek: 0,
        startTime: "09:30",
        endTime: "12:00",
        isOpenEnded: false,
        notes: null,
      },
      {
        title: "Legs",
        category: "gym",
        occurrenceDate: "2026-08-26",
        dayOfWeek: 2,
        startTime: "15:30",
        endTime: "18:00",
        isOpenEnded: false,
        notes: null,
      },
      "this_date_only",
    );

    expect(plan).toEqual({
      rpc: "jarvis_schedule_move_occurrence",
      args: expect.objectContaining({
        p_source_date: "2026-08-24",
        p_target_date: "2026-08-26",
      }),
    });
  });

  it("maps occurrence delete to skip RPC", () => {
    const plan = buildDeleteScheduleMutationPlan(
      {
        scheduleId: "schedule-1",
        scheduleItemId: "item-1",
        overrideId: null,
        source: "recurring",
        occurrenceKey: "key",
        weekdayLabel: "MON",
        title: "Legs",
        category: "gym",
        occurrenceDate: "2026-08-24",
        dayOfWeek: 0,
        startTime: "09:30",
        endTime: "12:00",
        isOpenEnded: false,
        notes: null,
      },
      "this_date_only",
    );

    expect(plan).toEqual({
      rpc: "jarvis_schedule_skip_occurrence",
      args: expect.objectContaining({
        p_occurrence_date: "2026-08-24",
      }),
    });
  });
});

describe("schedule write executor gating", () => {
  it("forbids schedule write tools outside interactive Main Jarvis", async () => {
    const supabase = buildSupabaseMock() as never;

    const result = JSON.parse(
      await executeJarvisTool(
        supabase,
        USER_A,
        {
          type: "function_call",
          name: "confirm_pending_schedule_action",
          call_id: "call-1",
          arguments: JSON.stringify({ pendingActionId: "pending-1" }),
        } as never,
        null,
        {
          agentKey: "melusi",
          toolCallId: "call-1",
          isInteractiveMainJarvisTurn: false,
        },
      ),
    );

    expect(result.errorCode).toBe("action_forbidden");
  });
});

describe("D7.6 migration file", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260813120000_add_jarvis_schedule_chat_action_execution.sql",
  );

  function readMigration() {
    return readFileSync(migrationPath, "utf8");
  }

  it("defines atomic execute pending action RPC", () => {
    const migration = readMigration();

    expect(migration).toContain("jarvis_schedule_execute_pending_action");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.jarvis_schedule_execute_pending_action");
  });

  it("does not expose a separately callable dispatch helper", () => {
    const migration = readMigration();

    expect(migration).not.toContain("jarvis_schedule_dispatch_mutation_plan");
    expect(migration).toContain("CASE v_rpc");
    expect(migration).toContain("unsupported_rpc");
  });

  it("uses hardcoded whitelist dispatch without dynamic SQL", () => {
    const migration = readMigration();

    expect(migration).not.toMatch(/EXECUTE\s+format/i);
    expect(migration).not.toMatch(/EXECUTE\s+\$/i);
    expect(migration).not.toContain("SECURITY DEFINER");
  });

  it("protects pending proposal identity fields from in-place mutation", () => {
    const migration = readMigration();

    expect(migration).toContain("prevent_jarvis_pending_schedule_action_identity_mutation");
    expect(migration).toContain("NEW.payload IS DISTINCT FROM OLD.payload");
    expect(migration).toContain("NEW.summary IS DISTINCT FROM OLD.summary");
    expect(migration).toContain("NEW.expires_at IS DISTINCT FROM OLD.expires_at");
  });

  it("enforces one active Main pending proposal per user", () => {
    const migration = readMigration();

    expect(migration).toContain("jarvis_pending_schedule_actions_one_active_main_idx");
    expect(migration).toContain("WHERE status = 'pending'::text AND agent_key = 'main'::text");
  });

  it("persists failed status after mutation exceptions", () => {
    const migration = readMigration();

    expect(migration).toContain("EXCEPTION");
    expect(migration).toContain("WHEN OTHERS THEN");
    expect(migration).toContain("status = 'failed'");
  });

  it("revokes public execute on user-facing RPC", () => {
    const migration = readMigration();

    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.jarvis_schedule_execute_pending_action(uuid)",
    );
    expect(migration).not.toContain("TO anon");
  });
});

describe("confirm and cancel tool schemas", () => {
  it("accepts only pendingActionId for confirmation", () => {
    const confirmTool = MAIN_JARVIS_TOOLS.find(
      (tool) => tool.name === "confirm_pending_schedule_action",
    );

    expect(confirmTool?.parameters).toEqual({
      type: "object",
      properties: {
        pendingActionId: { type: "string" },
      },
      required: ["pendingActionId"],
      additionalProperties: false,
    });
  });

  it("does not expose raw execution plan fields on proposal tools", () => {
    const writeTools = MAIN_JARVIS_TOOLS.filter((tool) =>
      tool.name.startsWith("propose_"),
    );

    for (const tool of writeTools) {
      const serialized = JSON.stringify(tool.parameters);
      expect(serialized).not.toContain("execution");
      expect(serialized).not.toContain('"rpc"');
    }
  });
});

describe("schedule action read-only boundary", () => {
  it("does not route proposals through action_requests", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/jarvis/schedule/schedule-action-tools.ts"),
      "utf8",
    );

    expect(source).not.toContain("action_requests");
    expect(source).not.toContain("fall-2026-baseline-template");
  });
});
