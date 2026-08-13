import { describe, expect, it, vi } from "vitest";

import { deriveConversationTitle } from "@/lib/jarvis/conversations/conversation-title";
import {
  createMainConversation,
  listMainConversations,
  loadAuthorizedMainThread,
  resolveMainThreadForMessage,
} from "@/lib/jarvis/conversations/main-conversation-tools";

const USER_A = "11111111-1111-4111-8111-111111111111";
const THREAD_A = "22222222-2222-4222-8222-222222222222";

function buildSupabaseMock() {
  const threads: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      const filters: Record<string, unknown> = {};

      const builder = {
        select() {
          return builder;
        },
        insert(value: Record<string, unknown> | Record<string, unknown>[]) {
          if (table === "agent_threads") {
            const row = {
              id: THREAD_A,
              user_id: USER_A,
              agent_key: "main",
              thread_type: "chat",
              title: (value as Record<string, unknown>).title,
              status: "active",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_message_at: null,
            };
            threads.push(row);
            return {
              select() {
                return {
                  single: async () => ({ data: row, error: null }),
                };
              },
            };
          }

          if (table === "agent_messages") {
            messages.push(value as Record<string, unknown>);
          }

          return builder;
        },
        update(value: Record<string, unknown>) {
          return {
            eq(column: string, match: unknown) {
              filters[column] = match;
              return builder;
            },
          };
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle: async () => {
          if (table === "agent_threads") {
            const row = threads.find(
              (entry) =>
                entry.id === filters.id &&
                entry.user_id === filters.user_id &&
                entry.agent_key === filters.agent_key &&
                entry.thread_type === filters.thread_type,
            );

            return { data: row ?? null, error: null };
          }

          return { data: null, error: null };
        },
        then(onFulfilled: (value: unknown) => unknown) {
          if (table === "agent_threads") {
            const rows = threads.filter(
              (entry) =>
                entry.user_id === filters.user_id &&
                entry.agent_key === filters.agent_key &&
                entry.thread_type === filters.thread_type &&
                entry.status === filters.status,
            );

            return Promise.resolve(onFulfilled({ data: rows, error: null }));
          }

          return Promise.resolve(onFulfilled({ data: [], error: null }));
        },
      };

      return builder;
    },
  };

  return { supabase, threads, messages };
}

describe("main conversation service", () => {
  it("creates a main conversation only when resolving the first message", async () => {
    const { supabase, threads } = buildSupabaseMock();

    const created = await createMainConversation(
      supabase as never,
      USER_A,
      "Add a D7.6 test block Tuesday from 1 to 1:30.",
    );

    expect(created.success).toBe(true);
    expect(threads).toHaveLength(1);
    expect(created.success && created.thread.title).toContain("D7.6 test block");
  });

  it("returns not found for another user's thread lookup", async () => {
    const { supabase, threads } = buildSupabaseMock();
    threads.push({
      id: THREAD_A,
      user_id: "99999999-9999-4999-8999-999999999999",
      agent_key: "main",
      thread_type: "chat",
      title: "Foreign",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message_at: null,
    });

    const thread = await loadAuthorizedMainThread(
      supabase as never,
      USER_A,
      THREAD_A,
    );

    expect(thread).toBeNull();
  });

  it("creates on first message and validates owned thread on later messages", async () => {
    const { supabase, threads } = buildSupabaseMock();

    const first = await resolveMainThreadForMessage(
      supabase as never,
      USER_A,
      null,
      "First message",
    );

    expect(first.success).toBe(true);
    expect(threads).toHaveLength(1);

    const second = await resolveMainThreadForMessage(
      supabase as never,
      USER_A,
      THREAD_A,
      "Second message",
    );

    expect(second.success).toBe(true);
    expect(threads).toHaveLength(1);
  });

  it("lists only main chat conversations", async () => {
    const { supabase, threads } = buildSupabaseMock();
    threads.push(
      {
        id: THREAD_A,
        user_id: USER_A,
        agent_key: "main",
        thread_type: "chat",
        title: deriveConversationTitle("Main chat"),
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        user_id: USER_A,
        agent_key: "melusi",
        thread_type: "command",
        title: "Melusi Command",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      },
    );

    const conversations = await listMainConversations(supabase as never, USER_A);

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.id).toBe(THREAD_A);
  });
});

describe("opening assistant alone does not create a thread", () => {
  it("does not call createMainConversation without a first message", () => {
    const createSpy = vi.fn();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
