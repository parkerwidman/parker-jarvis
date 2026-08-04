import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseJarvisContextTargetFromBody } from "@/lib/jarvis/context/types";
import {
  parseAgentKeyFromBody,
  parseThreadIdFromBody,
} from "@/lib/jarvis/agents/agent-registry";
import { logAssistantError } from "@/lib/jarvis/agents/agent-diagnostics";
import {
  MAX_MESSAGE_LENGTH,
  runAgentChat,
} from "@/lib/jarvis/agents/run-agent-chat";

export const maxDuration = 60;

export async function POST(request: Request) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logAssistantError("request body parsing", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message =
    typeof body === "object" && body !== null && "message" in body
      ? (body as { message: unknown }).message
      : undefined;

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const contextTarget =
    typeof body === "object" && body !== null && "context" in body
      ? parseJarvisContextTargetFromBody(
          (body as { context: unknown }).context,
        )
      : null;

  const agentKey = parseAgentKeyFromBody(body);
  const threadId = parseThreadIdFromBody(body);

  try {
    const result = await runAgentChat({
      supabase,
      userId,
      message: message.trim(),
      agentKey,
      threadId,
      contextTarget,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      reply: result.reply,
      ...(result.threadId ? { threadId: result.threadId } : {}),
    });
  } catch (error) {
    logAssistantError("outer route handler", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
