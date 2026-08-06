import "server-only";

import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import {
  proposeOutlookCalendarEvent,
} from "@/lib/jarvis/tools/action-request-tools";
import {
  createGoal,
  saveMemory,
  updateJarvisProfile,
} from "@/lib/jarvis/tools/memory-tools";
import {
  createOutlookDraft,
  listOutlookCalendar,
  listOutlookInbox,
} from "@/lib/jarvis/tools/microsoft-tools";
import {
  completeTask,
  createTask,
  listTasks,
} from "@/lib/jarvis/tools/task-tools";
import {
  createProjectForModule,
  listProjectsForModule,
  updateProjectStatusForModule,
} from "@/lib/jarvis/projects/project-tools";
import {
  createMelusiProjectUpdate,
  listMelusiProjectUpdates,
} from "@/lib/jarvis/projects/project-update-tools";
import { getMelusiSocialPerformance } from "@/lib/jarvis/melusi/melusi-social-tools";
import { getMelusiExpenses } from "@/lib/jarvis/melusi/melusi-expense-tools";
import { logAssistantError } from "./agent-diagnostics";

function nullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : null;
}

function nullableModuleKey(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function requireMelusiModuleKey(
  value: unknown,
): { moduleKey: "melusi" } | { error: string } {
  if (value === "melusi") {
    return { moduleKey: "melusi" };
  }

  return { error: "Invalid life area module." };
}

function resolveProjectToolArgs(
  args: Record<string, unknown>,
  contextTarget: JarvisContextTarget | null,
): { projectId?: string; projectName?: string } {
  let projectId = nullableString(args.projectId) ?? undefined;
  let projectName = nullableString(args.projectName) ?? undefined;

  if (contextTarget?.type === "melusi_project" && !projectId && !projectName) {
    projectId = contextTarget.id;
  }

  return { projectId, projectName };
}

export async function executeJarvisTool(
  supabase: SupabaseClient,
  userId: string,
  call: OpenAI.Responses.ResponseFunctionToolCall,
  contextTarget: JarvisContextTarget | null,
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
      case "list_tasks": {
        const projectArgs = resolveProjectToolArgs(args, contextTarget);

        return JSON.stringify(
          await listTasks(supabase, userId, {
            lifeAreaModuleKey: nullableModuleKey(args.lifeAreaModuleKey),
            unfinishedOnly: args.unfinishedOnly === true,
            projectId: projectArgs.projectId,
            projectName: projectArgs.projectName,
          }),
        );
      }
      case "create_task": {
        const projectArgs = resolveProjectToolArgs(args, contextTarget);

        return JSON.stringify(
          await createTask(supabase, userId, {
            title: String(args.title ?? ""),
            priority:
              typeof args.priority === "string" ? args.priority : undefined,
            dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
            lifeAreaModuleKey: nullableModuleKey(args.lifeAreaModuleKey),
            projectId: projectArgs.projectId,
            projectName: projectArgs.projectName,
          }),
        );
      }
      case "complete_task":
        return JSON.stringify(
          await completeTask(supabase, userId, {
            taskId: String(args.taskId ?? ""),
          }),
        );
      case "list_projects": {
        const module = requireMelusiModuleKey(args.lifeAreaModuleKey);

        if ("error" in module) {
          return JSON.stringify({ success: false, error: module.error });
        }

        return JSON.stringify(
          await listProjectsForModule(
            supabase,
            userId,
            module.moduleKey,
            {
              status:
                typeof args.status === "string" ? args.status : undefined,
              priority:
                typeof args.priority === "string" ? args.priority : undefined,
              includeArchived: args.includeArchived === true,
            },
          ),
        );
      }
      case "create_project": {
        const module = requireMelusiModuleKey(args.lifeAreaModuleKey);

        if ("error" in module) {
          return JSON.stringify({ success: false, error: module.error });
        }

        return JSON.stringify(
          await createProjectForModule(supabase, userId, module.moduleKey, {
            name: String(args.name ?? ""),
            description:
              typeof args.description === "string" ? args.description : undefined,
            priority:
              typeof args.priority === "string" ? args.priority : undefined,
            dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
          }),
        );
      }
      case "update_project_status": {
        const module = requireMelusiModuleKey(args.lifeAreaModuleKey);

        if ("error" in module) {
          return JSON.stringify({ success: false, error: module.error });
        }

        const projectArgs = resolveProjectToolArgs(args, contextTarget);

        return JSON.stringify(
          await updateProjectStatusForModule(supabase, userId, module.moduleKey, {
            projectId: projectArgs.projectId,
            projectName: projectArgs.projectName,
            status: String(args.status ?? ""),
          }),
        );
      }
      case "create_project_update": {
        const projectArgs = resolveProjectToolArgs(args, contextTarget);

        return JSON.stringify(
          await createMelusiProjectUpdate(supabase, userId, {
            projectId: projectArgs.projectId,
            projectName: projectArgs.projectName,
            updateType: String(args.updateType ?? ""),
            content: String(args.content ?? ""),
          }),
        );
      }
      case "list_project_updates": {
        const projectArgs = resolveProjectToolArgs(args, contextTarget);

        return JSON.stringify(
          await listMelusiProjectUpdates(supabase, userId, {
            projectId: projectArgs.projectId,
            projectName: projectArgs.projectName,
            updateType:
              typeof args.updateType === "string" ? args.updateType : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
          }),
        );
      }
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
      case "list_outlook_inbox":
        return JSON.stringify(
          await listOutlookInbox(supabase, userId, {
            limit: Number(args.limit),
            unreadOnly: args.unreadOnly === true,
          }),
        );
      case "list_outlook_calendar":
        return JSON.stringify(
          await listOutlookCalendar(supabase, userId, {
            startDateTime: String(args.startDateTime ?? ""),
            endDateTime: String(args.endDateTime ?? ""),
            timeZone: String(args.timeZone ?? ""),
          }),
        );
      case "create_outlook_draft":
        return JSON.stringify(
          await createOutlookDraft(supabase, userId, {
            toRecipients: Array.isArray(args.toRecipients)
              ? args.toRecipients.map(String)
              : [],
            ccRecipients: Array.isArray(args.ccRecipients)
              ? args.ccRecipients.map(String)
              : [],
            subject: String(args.subject ?? ""),
            body: String(args.body ?? ""),
          }),
        );
      case "propose_outlook_calendar_event":
        return JSON.stringify(
          await proposeOutlookCalendarEvent(supabase, userId, {
            subject: String(args.subject ?? ""),
            startDateTime: String(args.startDateTime ?? ""),
            endDateTime: String(args.endDateTime ?? ""),
            timeZone: String(args.timeZone ?? ""),
            locationName: nullableString(args.locationName),
            notes: nullableString(args.notes),
          }),
        );
      case "get_melusi_social_performance":
        return JSON.stringify(
          await getMelusiSocialPerformance(supabase, userId, {
            focus: args.focus,
            network: args.network,
          }),
        );
      case "get_melusi_expenses":
        return JSON.stringify(
          await getMelusiExpenses(supabase, userId, {
            focus: args.focus,
            historyLimit: args.historyLimit,
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
