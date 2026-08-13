import { NextResponse } from "next/server";

import { isValidThreadId } from "@/lib/jarvis/agents/types";
import { loadMainThreadMessagesPage } from "@/lib/jarvis/conversations/main-conversation-tools";
import {
  parseMessagePageCursor,
  parseMessagePaginationLimit,
} from "@/lib/jarvis/conversations/message-pagination";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;

  if (!isValidThreadId(threadId)) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeId = url.searchParams.get("beforeId");
  const limit = parseMessagePaginationLimit(url.searchParams.get("limit"));

  const before = parseMessagePageCursor({ beforeCreatedAt, beforeId });

  if (before === "invalid") {
    return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
  }

  const page = await loadMainThreadMessagesPage(supabase, userId, threadId, {
    limit,
    before,
  });

  if (page.messages.length === 0 && before) {
    return NextResponse.json({ messages: [], hasOlder: false });
  }

  if (page.messages.length === 0 && !before) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json(page);
}
