import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  completeTask,
  createTask,
  listTasks,
} from "@/lib/jarvis/tools/task-tools";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOOL_ROUNDS = 5;

const SENSITIVE_LOG_PATTERNS: RegExp[] = [
  /OPENAI_API_KEY[=:\s]*\S+/gi,
  /SUPABASE[_A-Z]*[=:\s]*\S+/gi,
  /Cookie:\s*[^\n\r]*/gi,
  /Set-Cookie:\s*[^\n\r]*/gi,
  /authorization[=:\s]*\S+/gi,
  /Bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9_-]{8,}/g,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWT-shaped tokens
  /process\.env\.[A-Z0-9_]+/gi,
];

function sanitizeLogValue(value: string): string {
  let sanitized = value;
  for (const pattern of SENSITIVE_LOG_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

function logAssistantError(stage: string, error: unknown): void {
  const payload: Record<string, unknown> = { stage };

  if (error instanceof Error) {
    payload.name = error.name;
    payload.message = sanitizeLogValue(error.message);
    if (error.stack) {
      payload.stack = sanitizeLogValue(error.stack);
    }

    const extra = error as Error & Record<string, unknown>;
    if (typeof extra.status === "number" || typeof extra.status === "string") {
      payload.status = extra.status;
    }
    if (typeof extra.code === "string" || typeof extra.code === "number") {
      payload.code = extra.code;
    }
    if (typeof extra.type === "string") {
      payload.type = extra.type;
    }
    if (typeof extra.request_id === "string") {
      payload.request_id = extra.request_id;
    }
  } else if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;

    if (typeof record.name === "string") {
      payload.name = record.name;
    }
    if (typeof record.message === "string") {
      payload.message = sanitizeLogValue(record.message);
    }
    if (typeof record.status === "number" || typeof record.status === "string") {
      payload.status = record.status;
    }
    if (typeof record.code === "string" || typeof record.code === "number") {
      payload.code = record.code;
    }
    if (typeof record.type === "string") {
      payload.type = record.type;
    }
    if (typeof record.request_id === "string") {
      payload.request_id = record.request_id;
    }
    if (typeof record.stack === "string") {
      payload.stack = sanitizeLogValue(record.stack);
    }
  } else if (typeof error === "string") {
    payload.message = sanitizeLogValue(error);
  }

  console.error("[Jarvis assistant diagnostic]", payload);
}

const JARVIS_INSTRUCTIONS = `You are Jarvis, Parker's private personal AI assistant.

Be direct, organized, practical, and honest in every response.

You can read Parker's tasks, create tasks, and complete tasks using your task tools.

You still cannot access email, calendars, files, WHOOP, social media, or any other external systems. You have no long-term memory beyond this conversation.

You may automatically read tasks when needed to answer questions or find a task to complete.

You may create or complete a task only when Parker clearly asks you to.

Never claim an action succeeded unless the corresponding tool returned success.

If a requested task is ambiguous, ask Parker to clarify before acting.

If Parker asks to complete a task by name, call list_tasks, identify the matching task, then call complete_task with its id.

If multiple tasks have similar names, ask Parker which one to complete before calling complete_task.

Do not pretend you completed actions you cannot perform. If Parker asks for something outside your current tools, say so clearly.`;

const TASK_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "list_tasks",
    description:
      "List Parker's tasks from Supabase. Use this to see open and completed tasks, answer questions about Parker's task list, or find a task id before completing a task by name.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "create_task",
    description:
      "Create a new task for Parker. Use only when Parker clearly asks you to add or create a task.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The task title, between 1 and 200 characters.",
        },
        priority: {
          type: ["string", "null"],
          enum: ["low", "medium", "high", null],
          description:
            "Task priority. Pass null when Parker did not specify; defaults to medium.",
        },
        dueDate: {
          type: ["string", "null"],
          description:
            "Due date in YYYY-MM-DD format, such as 2026-07-29. Pass null when Parker did not specify a due date.",
        },
      },
      required: ["title", "priority", "dueDate"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "complete_task",
    description:
      "Mark one of Parker's tasks as done. Use only when Parker clearly asks to complete or finish a task. Requires the task UUID, not the title.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The UUID of the task to mark as done.",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    strict: true,
  },
];

async function executeTaskTool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  call: OpenAI.Responses.ResponseFunctionToolCall,
): Promise<string> {
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>;
  } catch (error) {
    logAssistantError("tool argument parsing", error);
    return JSON.stringify({
      success: false,
      error: "Tool execution failed.",
    });
  }

  try {
    switch (call.name) {
      case "list_tasks":
        return JSON.stringify(await listTasks(supabase));
      case "create_task":
        return JSON.stringify(
          await createTask(supabase, {
            title: String(args.title ?? ""),
            priority:
              typeof args.priority === "string" ? args.priority : undefined,
            dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
          }),
        );
      case "complete_task":
        return JSON.stringify(
          await completeTask(supabase, {
            taskId: String(args.taskId ?? ""),
          }),
        );
      default:
        return JSON.stringify({
          success: false,
          error: "Unknown tool.",
        });
    }
  } catch (error) {
    logAssistantError("tool execution", error);
    return JSON.stringify({
      success: false,
      error: "Tool execution failed.",
    });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
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

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const input: OpenAI.Responses.ResponseInput = [
      { role: "user", content: message.trim() },
    ];

    let response: OpenAI.Responses.Response;

    try {
      response = await openai.responses.create({
        model: "gpt-5",
        store: false,
        max_output_tokens: 1024,
        instructions: JARVIS_INSTRUCTIONS,
        tools: TASK_TOOLS,
        input,
      });
    } catch (error) {
      logAssistantError("initial OpenAI request", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call",
      );

      if (functionCalls.length === 0) {
        break;
      }

      input.push(...response.output);

      for (const call of functionCalls) {
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: await executeTaskTool(supabase, call),
        });
      }

      try {
        response = await openai.responses.create({
          model: "gpt-5",
          store: false,
          max_output_tokens: 1024,
          instructions: JARVIS_INSTRUCTIONS,
          tools: TASK_TOOLS,
          input,
        });
      } catch (error) {
        logAssistantError("follow-up OpenAI request", error);
        return NextResponse.json(
          { error: "Something went wrong. Please try again." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ reply: response.output_text ?? "" });
  } catch (error) {
    logAssistantError("outer route handler", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
