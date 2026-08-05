import "server-only";

import { loadLifeAreaDashboard } from "@/lib/jarvis/life-areas/load-life-area-dashboard";
import {
  buildMelusiCommandCenterView,
  type MelusiActiveProject,
  type MelusiAttentionItem,
  type MelusiBusinessPriority,
  type MelusiSnapshotItem,
  type MelusiTaskGroups,
} from "@/lib/jarvis/melusi/build-melusi-command-center-view";
import type { SocialCommandCenterSummary } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import {
  formatLocalDateLabel,
  getLocalDateFromIso,
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_APPROVALS = 5;
const MAX_UPDATES = 20;

type ActionRequestRow = {
  id: string;
  title: string;
  summary: string;
  risk_level: string | null;
};

type ProjectUpdateRow = {
  id: string;
  project_id: string;
  update_type: string;
  content: string;
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_at: string | null;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
  created_at: string;
  project_id: string | null;
};

export type MelusiCommandCenterData = {
  preferredName: string;
  timezone: string;
  todayDate: string;
  todayDateLabel: string;
  businessPriority: MelusiBusinessPriority;
  taskGroups: MelusiTaskGroups;
  snapshotItems: MelusiSnapshotItem[];
  activeProjects: MelusiActiveProject[];
  attentionItems: MelusiAttentionItem[];
  headerStatus: string;
  businessContextLine: string;
};

export async function loadMelusiCommandCenter(
  supabase: SupabaseClient,
  userId: string,
  socialInput?: {
    summary: SocialCommandCenterSummary | null;
    connected: boolean;
    status: string;
  },
): Promise<MelusiCommandCenterData> {
  const [{ data: profileRow }, dashboard] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("preferred_name, timezone")
      .eq("user_id", userId)
      .maybeSingle(),
    loadLifeAreaDashboard(supabase, userId, "melusi"),
  ]);

  const timezone = resolveTimeZone(profileRow?.timezone ?? null);
  const todayLocal = getLocalDateString(timezone);
  const preferredName = profileRow?.preferred_name?.trim() || "Parker";
  const lifeAreaId = dashboard.lifeArea?.id ?? null;

  let approvals: ActionRequestRow[] = [];
  let projectUpdates: ProjectUpdateRow[] = [];
  let allMelusiTasks: TaskRow[] = [];
  let projectRows: ProjectRow[] = [];

  if (lifeAreaId) {
    const [approvalsResult, updatesResult, tasksResult, projectsResult] =
      await Promise.all([
        supabase
          .from("action_requests")
          .select("id, title, summary, risk_level")
          .eq("user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(MAX_APPROVALS),
        supabase
          .from("project_updates")
          .select("id, project_id, update_type, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(MAX_UPDATES),
        supabase
          .from("tasks")
          .select("id, title, priority, due_at, status, created_at, project_id")
          .eq("user_id", userId)
          .eq("life_area_id", lifeAreaId)
          .neq("status", "done"),
        supabase
          .from("projects")
          .select("id, name, status, priority, due_at, updated_at")
          .eq("user_id", userId)
          .eq("life_area_id", lifeAreaId),
      ]);

    approvals = (approvalsResult.data ?? []) as ActionRequestRow[];
    projectUpdates = (updatesResult.data ?? []) as ProjectUpdateRow[];
    allMelusiTasks = (tasksResult.data ?? []) as TaskRow[];
    projectRows = (projectsResult.data ?? []) as ProjectRow[];
  }

  const projectNames = new Map(projectRows.map((project) => [project.id, project.name]));

  const overdueTaskCount = allMelusiTasks.filter((task) => {
    if (!task.due_at) {
      return false;
    }

    return getLocalDateFromIso(task.due_at, timezone) < todayLocal;
  }).length;

  const view = buildMelusiCommandCenterView({
    unfinishedTasks: allMelusiTasks,
    projects: projectRows,
    projectUpdates,
    approvals: approvals.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      riskLevel: row.risk_level,
    })),
    projectNames,
    todayLocal,
    timeZone: timezone,
    activeProjectCount: dashboard.counts.activeProjects,
    openTaskCount: dashboard.counts.unfinishedTasks,
    overdueTaskCount,
    socialSummary: socialInput?.summary ?? null,
    socialConnected: socialInput?.connected ?? false,
    socialStatus: socialInput?.status ?? "disconnected",
  });

  return {
    preferredName,
    timezone,
    todayDate: todayLocal,
    todayDateLabel: formatLocalDateLabel(timezone),
    businessContextLine: "B2C: AI Foundations · B2B: AI Foundations for Real Estate",
    ...view,
  };
}
