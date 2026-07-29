import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createGoal,
  loadJarvisContext,
  saveMemory,
  updateJarvisProfile,
  type JarvisContext,
} from "@/lib/jarvis/tools/memory-tools";
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

const BASE_JARVIS_INSTRUCTIONS = `You are Jarvis, Parker's private personal AI assistant.

Be direct, organized, practical, and honest in every response.

You can read Parker's tasks, create tasks, and complete tasks using your task tools.

You can read saved profile information, life areas, goals, and memories that are provided in your personal context below.

You can update Parker's profile, save memories, and create goals using your memory tools.

You still cannot access email, calendars, files, WHOOP, social media, school systems, or the web.

You may automatically read tasks when needed to answer questions or find a task to complete.

You may create or complete a task only when Parker clearly asks you to.

You may update the profile only when Parker explicitly states that profile information should be set or changed.

You may save a memory only when Parker explicitly says to remember, save, store, or keep something for the future.

You must not permanently save ordinary conversation automatically.

You must not save guesses or inferred personal facts as confirmed memories.

You may create a goal only when Parker clearly asks to create, save, add, or track a goal.

After a successful save or update tool result, confirm what was saved.

Never claim an action succeeded unless the corresponding tool returned success.

Use saved information naturally in future answers.

Do not offer actions you do not currently have tools to perform.

If a requested task is ambiguous, ask Parker to clarify before acting.

If Parker asks to complete a task by name, call list_tasks, identify the matching task, then call complete_task with its id.

If multiple tasks have similar names, ask Parker which one to complete before calling complete_task.

Do not pretend you completed actions you cannot perform. If Parker asks for something outside your current tools, say so clearly.`;

function buildPersonalContextSection(context: JarvisContext): string {
  const sections: string[] = [];

  if (context.profile) {
    const profileParts: string[] = [];

    if (context.profile.preferred_name) {
      profileParts.push(`Preferred name: ${context.profile.preferred_name}`);
    }
    if (context.profile.timezone) {
      profileParts.push(`Timezone: ${context.profile.timezone}`);
    }
    if (context.profile.communication_style) {
      profileParts.push(
        `Communication style: ${context.profile.communication_style}`,
      );
    }
    if (context.profile.current_focus) {
      profileParts.push(`Current focus: ${context.profile.current_focus}`);
    }

    if (profileParts.length > 0) {
      sections.push(`Profile:\n${profileParts.join("\n")}`);
    }
  }

  if (context.lifeAreas.length > 0) {
    const names = context.lifeAreas.map((area) => area.name).join(", ");
    sections.push(`Life areas: ${names}`);
  }

  if (context.goals.length > 0) {
    const goalLines = context.goals.map((goal) => {
      const parts = [`- ${goal.title} (${goal.status}, ${goal.priority} priority)`];

      if (goal.description) {
        parts.push(`  Description: ${goal.description}`);
      }
      if (goal.success_definition) {
        parts.push(`  Success: ${goal.success_definition}`);
      }
      if (goal.target_date) {
        parts.push(`  Target date: ${goal.target_date}`);
      }
      if (goal.progress > 0) {
        parts.push(`  Progress: ${goal.progress}%`);
      }

      const lifeArea = context.lifeAreas.find(
        (area) => area.id === goal.life_area_id,
      );
      if (lifeArea) {
        parts.push(`  Life area: ${lifeArea.name}`);
      }

      return parts.join("\n");
    });

    sections.push(`Goals:\n${goalLines.join("\n")}`);
  }

  if (context.memories.length > 0) {
    const memoryLines = context.memories.map(
      (memory) =>
        `- [${memory.category}, importance ${memory.importance}] ${memory.content}`,
    );
    sections.push(`Memories:\n${memoryLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\nPersonal context (saved information about Parker):\n${sections.join("\n\n")}`;
}

function buildInstructions(context: JarvisContext): string {
  return BASE_JARVIS_INSTRUCTIONS + buildPersonalContextSection(context);
}

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

const MEMORY_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "update_jarvis_profile",
    description:
      "Update Parker's Jarvis profile. Use only when Parker explicitly asks to set or change profile information such as preferred name, timezone, communication style, or current focus.",
    parameters: {
      type: "object",
      properties: {
        preferredName: {
          type: ["string", "null"],
          description:
            "Parker's preferred name. Pass null when not changing this field.",
        },
        timezone: {
          type: ["string", "null"],
          description:
            "Parker's timezone, such as America/Chicago. Pass null when not changing this field.",
        },
        communicationStyle: {
          type: ["string", "null"],
          description:
            "How Parker prefers Jarvis to communicate. Pass null when not changing this field.",
        },
        currentFocus: {
          type: ["string", "null"],
          description:
            "Parker's current focus or priority. Pass null when not changing this field.",
        },
      },
      required: [
        "preferredName",
        "timezone",
        "communicationStyle",
        "currentFocus",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "save_memory",
    description:
      "Save a confirmed memory for Parker. Use only when Parker explicitly asks to remember, save, store, or keep something for the future.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The memory content to save.",
        },
        category: {
          type: "string",
          enum: [
            "profile",
            "preference",
            "routine",
            "decision",
            "context",
            "person",
            "business",
            "school",
            "fitness",
            "other",
          ],
          description: "The category that best fits this memory.",
        },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "How important this memory is, from 1 (low) to 5 (high).",
        },
      },
      required: ["content", "category", "importance"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "create_goal",
    description:
      "Create a new goal for Parker. Use only when Parker clearly asks to create, save, add, or track a goal.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The goal title, between 1 and 200 characters.",
        },
        description: {
          type: ["string", "null"],
          description:
            "Optional description of the goal. Pass null when not provided.",
        },
        successDefinition: {
          type: ["string", "null"],
          description:
            "How Parker will know the goal is achieved. Pass null when not provided.",
        },
        priority: {
          type: ["string", "null"],
          enum: ["low", "medium", "high", null],
          description:
            "Goal priority. Pass null when Parker did not specify; defaults to medium.",
        },
        targetDate: {
          type: ["string", "null"],
          description:
            "Target date in YYYY-MM-DD format. Pass null when Parker did not specify a date.",
        },
        lifeAreaName: {
          type: ["string", "null"],
          description:
            "Life area name to associate with this goal. Pass null when not specified.",
        },
      },
      required: [
        "title",
        "description",
        "successDefinition",
        "priority",
        "targetDate",
        "lifeAreaName",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
];

const JARVIS_TOOLS: OpenAI.Responses.Tool[] = [...TASK_TOOLS, ...MEMORY_TOOLS];

function nullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : null;
}

async function executeJarvisTool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
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
      case "update_jarvis_profile":
        return JSON.stringify(
          await updateJarvisProfile(supabase, userId, {
            preferredName: nullableString(args.preferredName),
            timezone: nullableString(args.timezone),
            communicationStyle: nullableString(args.communicationStyle),
            currentFocus: nullableString(args.currentFocus),
          }),
        );
      case "save_memory":
        return JSON.stringify(
          await saveMemory(supabase, userId, {
            content: String(args.content ?? ""),
            category: String(args.category ?? ""),
            importance: Number(args.importance),
          }),
        );
      case "create_goal":
        return JSON.stringify(
          await createGoal(supabase, userId, {
            title: String(args.title ?? ""),
            description: nullableString(args.description),
            successDefinition: nullableString(args.successDefinition),
            priority: nullableString(args.priority),
            targetDate: nullableString(args.targetDate),
            lifeAreaName: nullableString(args.lifeAreaName),
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

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const jarvisContext = await loadJarvisContext(supabase);
    const instructions = buildInstructions(jarvisContext);

    const input: OpenAI.Responses.ResponseInput = [
      { role: "user", content: message.trim() },
    ];

    let response: OpenAI.Responses.Response;

    try {
      response = await openai.responses.create({
        model: "gpt-5",
        store: false,
        max_output_tokens: 1024,
        instructions,
        tools: JARVIS_TOOLS,
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
          output: await executeJarvisTool(supabase, userId, call),
        });
      }

      try {
        response = await openai.responses.create({
          model: "gpt-5",
          store: false,
          max_output_tokens: 1024,
          instructions,
          tools: JARVIS_TOOLS,
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
