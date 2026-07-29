import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

const VALID_MEMORY_CATEGORIES = new Set([
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
]);

const PROFILE_SELECT =
  "user_id, preferred_name, timezone, communication_style, current_focus, created_at, updated_at";

const LIFE_AREA_SELECT = "id, name, active, created_at";

const GOAL_SELECT =
  "id, title, description, success_definition, status, priority, progress, target_date, life_area_id, created_at";

const MEMORY_SELECT =
  "id, category, content, importance, confirmed_by_user, created_at";

export type JarvisProfile = {
  user_id: string;
  preferred_name: string | null;
  timezone: string | null;
  communication_style: string | null;
  current_focus: string | null;
  created_at: string;
  updated_at: string;
};

export type LifeArea = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  success_definition: string | null;
  status: string;
  priority: string;
  progress: number;
  target_date: string | null;
  life_area_id: string | null;
  created_at: string;
};

export type Memory = {
  id: string;
  category: string;
  content: string;
  importance: number;
  confirmed_by_user: boolean;
  created_at: string;
};

export type JarvisContext = {
  profile: JarvisProfile | null;
  lifeAreas: LifeArea[];
  goals: Goal[];
  memories: Memory[];
};

export type UpdateJarvisProfileResult =
  | { success: true; profile: JarvisProfile }
  | { success: false; error: string };

export type SaveMemoryResult =
  | { success: true; memory: Memory }
  | { success: false; error: string };

export type CreateGoalResult =
  | {
      success: true;
      goal: Goal;
      lifeArea: Pick<LifeArea, "id" | "name"> | null;
    }
  | { success: false; error: string };

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function loadJarvisContext(
  supabase: SupabaseClient,
): Promise<JarvisContext> {
  const empty: JarvisContext = {
    profile: null,
    lifeAreas: [],
    goals: [],
    memories: [],
  };

  const { data: profile, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (profileError) {
    return empty;
  }

  const { data: lifeAreas, error: lifeAreasError } = await supabase
    .from("life_areas")
    .select(LIFE_AREA_SELECT)
    .eq("active", true);

  if (lifeAreasError) {
    return { ...empty, profile };
  }

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select(GOAL_SELECT)
    .in("status", ["active", "paused"]);

  if (goalsError) {
    return { ...empty, profile, lifeAreas: lifeAreas ?? [] };
  }

  const { data: memories, error: memoriesError } = await supabase
    .from("memories")
    .select(MEMORY_SELECT)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (memoriesError) {
    return {
      profile,
      lifeAreas: lifeAreas ?? [],
      goals: goals ?? [],
      memories: [],
    };
  }

  return {
    profile,
    lifeAreas: lifeAreas ?? [],
    goals: goals ?? [],
    memories: memories ?? [],
  };
}

function resolveProfileField(
  incoming: string | null,
  existing: string | null | undefined,
): string | null {
  if (incoming === null) {
    return existing ?? null;
  }

  return trimOrNull(incoming);
}

export async function updateJarvisProfile(
  supabase: SupabaseClient,
  userId: string,
  input: {
    preferredName: string | null;
    timezone: string | null;
    communicationStyle: string | null;
    currentFocus: string | null;
  },
): Promise<UpdateJarvisProfileResult> {
  const { data: existing, error: existingError } = await supabase
    .from("jarvis_profiles")
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: "Could not update profile." };
  }

  const preferred_name = resolveProfileField(
    input.preferredName,
    existing?.preferred_name,
  );
  const timezone = resolveProfileField(input.timezone, existing?.timezone);
  const communication_style = resolveProfileField(
    input.communicationStyle,
    existing?.communication_style,
  );
  const current_focus = resolveProfileField(
    input.currentFocus,
    existing?.current_focus,
  );

  const fields = [
    preferred_name,
    timezone,
    communication_style,
    current_focus,
  ];

  for (const field of fields) {
    if (field !== null && field.length > 500) {
      return {
        success: false,
        error: "Profile fields must be 500 characters or fewer.",
      };
    }
  }

  const { data, error } = await supabase
    .from("jarvis_profiles")
    .upsert(
      {
        user_id: userId,
        preferred_name,
        timezone,
        communication_style,
        current_focus,
      },
      { onConflict: "user_id" },
    )
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not update profile." };
  }

  return { success: true, profile: data };
}

export async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  input: {
    content: string;
    category: string;
    importance: number;
  },
): Promise<SaveMemoryResult> {
  const content = input.content.trim();
  const category = input.category.trim();

  if (!content || content.length > 10000) {
    return {
      success: false,
      error: "Content must be between 1 and 10000 characters.",
    };
  }

  if (!VALID_MEMORY_CATEGORIES.has(category)) {
    return {
      success: false,
      error: "Category is not valid.",
    };
  }

  if (
    !Number.isInteger(input.importance) ||
    input.importance < 1 ||
    input.importance > 5
  ) {
    return {
      success: false,
      error: "Importance must be an integer from 1 to 5.",
    };
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: userId,
      content,
      category,
      importance: input.importance,
      source: "user",
      confirmed_by_user: true,
      active: true,
    })
    .select(MEMORY_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not save memory." };
  }

  return { success: true, memory: data };
}

async function resolveLifeAreaId(
  supabase: SupabaseClient,
  userId: string,
  lifeAreaName: string,
): Promise<
  | { success: true; lifeArea: Pick<LifeArea, "id" | "name"> }
  | { success: false; error: string }
> {
  const name = lifeAreaName.trim();

  if (!name) {
    return { success: false, error: "Life area name is invalid." };
  }

  const { data: existing, error: findError } = await supabase
    .from("life_areas")
    .select("id, name")
    .eq("name", name)
    .maybeSingle();

  if (findError) {
    return { success: false, error: "Could not look up life area." };
  }

  if (existing) {
    return { success: true, lifeArea: existing };
  }

  const { data: created, error: createError } = await supabase
    .from("life_areas")
    .insert({
      user_id: userId,
      name,
      active: true,
    })
    .select("id, name")
    .single();

  if (createError || !created) {
    return { success: false, error: "Could not create life area." };
  }

  return { success: true, lifeArea: created };
}

export async function createGoal(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    description: string | null;
    successDefinition: string | null;
    priority: string | null;
    targetDate: string | null;
    lifeAreaName: string | null;
  },
): Promise<CreateGoalResult> {
  const title = input.title.trim();
  const description = trimOrNull(input.description);
  const success_definition = trimOrNull(input.successDefinition);
  const priority = input.priority === null ? "medium" : input.priority.trim();
  const lifeAreaName = trimOrNull(input.lifeAreaName);

  if (!title || title.length > 200) {
    return {
      success: false,
      error: "Title must be between 1 and 200 characters.",
    };
  }

  if (!VALID_PRIORITIES.has(priority)) {
    return {
      success: false,
      error: "Priority must be low, medium, or high.",
    };
  }

  let target_date: string | null = null;

  if (input.targetDate !== null) {
    target_date = parseDate(input.targetDate);
    if (!target_date) {
      return {
        success: false,
        error: "Target date must be in YYYY-MM-DD format.",
      };
    }
  }

  let life_area_id: string | null = null;
  let lifeArea: Pick<LifeArea, "id" | "name"> | null = null;

  if (lifeAreaName) {
    const resolved = await resolveLifeAreaId(supabase, userId, lifeAreaName);
    if (!resolved.success) {
      return resolved;
    }
    life_area_id = resolved.lifeArea.id;
    lifeArea = resolved.lifeArea;
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      title,
      description,
      success_definition,
      priority,
      target_date,
      life_area_id,
      status: "active",
      progress: 0,
    })
    .select(GOAL_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create goal." };
  }

  return { success: true, goal: data, lifeArea };
}
