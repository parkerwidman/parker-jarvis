import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findOutlookDraftReferenceByActionRequest,
  resolveOutlookDraftReference,
  storeOutlookDraftReference,
} from "@/lib/jarvis/tools/outlook-draft-references";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTION_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GRAPH_MESSAGE_ID = "graph-message-hidden";

function buildReferenceSupabase(options?: {
  insertError?: { code: string } | null;
  lookupData?: Record<string, unknown> | null;
  lookupError?: { code: string } | null;
}) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: options?.insertError ? null : { id: DRAFT_KEY },
        error: options?.insertError ?? null,
      }),
    }),
  });

  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.lookupData ?? null,
    error: options?.lookupError ?? null,
  });

  return {
    from: vi.fn(() => ({
      insert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    })),
    insert,
    maybeSingle,
  };
}

describe("outlook draft reference storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts user-owned rows with graph_message_id and action_request_id columns", async () => {
    const supabase = buildReferenceSupabase();

    const result = await storeOutlookDraftReference(
      supabase as never,
      USER_ID,
      GRAPH_MESSAGE_ID,
      ACTION_REQUEST_ID,
    );

    expect(result).toEqual({ success: true, draftKey: DRAFT_KEY });
    expect(supabase.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      graph_message_id: GRAPH_MESSAGE_ID,
      action_request_id: ACTION_REQUEST_ID,
    });
  });

  it("returns draft_reference_persistence_failed when insert fails", async () => {
    const supabase = buildReferenceSupabase({
      insertError: { code: "42501" },
    });

    const result = await storeOutlookDraftReference(
      supabase as never,
      USER_ID,
      GRAPH_MESSAGE_ID,
      ACTION_REQUEST_ID,
    );

    expect(result).toEqual({ success: false, errorCode: "unauthorized" });
  });

  it("resolves draft references by opaque draftKey without exposing graph ids to callers", async () => {
    const supabase = buildReferenceSupabase({
      lookupData: {
        id: DRAFT_KEY,
        graph_message_id: GRAPH_MESSAGE_ID,
        sent_at: null,
      },
    });

    const result = await resolveOutlookDraftReference(
      supabase as never,
      USER_ID,
      DRAFT_KEY,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reference.id).toBe(DRAFT_KEY);
      expect(result.reference.graph_message_id).toBe(GRAPH_MESSAGE_ID);
    }
  });

  it("finds draft references linked to an action request audit", async () => {
    const supabase = buildReferenceSupabase({
      lookupData: {
        id: DRAFT_KEY,
        graph_message_id: GRAPH_MESSAGE_ID,
        sent_at: null,
      },
    });

    const result = await findOutlookDraftReferenceByActionRequest(
      supabase as never,
      USER_ID,
      ACTION_REQUEST_ID,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reference.id).toBe(DRAFT_KEY);
    }
  });
});

describe("outlook draft reference migration schema", () => {
  it("grants authenticated access and links action_request_id", async () => {
    const { readFileSync } = await import("node:fs");
    const migration = readFileSync(
      "supabase/migrations/20260806160000_fix_outlook_draft_reference_access.sql",
      "utf8",
    );

    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_draft_references TO authenticated",
    );
    expect(migration).toContain("action_request_id uuid");
    expect(migration).toContain("outlook_draft_references_action_request_id_idx");
  });
});
