import { after } from "next/server";

import { maybeUpdateConversationSummary } from "@/lib/jarvis/context-engine/conversation-summary";
import { createClient } from "@/lib/supabase/server";

export function scheduleConversationSummaryUpdate(
  _supabase: unknown,
  userId: string,
  threadId: string,
): void {
  after(async () => {
    try {
      const supabase = await createClient();
      await maybeUpdateConversationSummary(supabase, userId, threadId);
    } catch {
      // Summary failures must not affect the user-facing conversation.
    }
  });
}
