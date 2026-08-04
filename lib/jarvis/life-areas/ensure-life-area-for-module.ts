import "server-only";

import { ensureMelusiLifeArea } from "@/lib/jarvis/life-areas/ensure-melusi-life-area";
import {
  getLifeAreaModule,
  type LifeAreaModuleKey,
} from "@/lib/jarvis/life-areas/module-registry";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureLifeAreaForModuleResult =
  | { success: true; lifeAreaId: string }
  | { success: false; error: string };

export async function ensureLifeAreaForModule(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: LifeAreaModuleKey,
): Promise<EnsureLifeAreaForModuleResult> {
  const module = getLifeAreaModule(moduleKey);

  if (!module.implemented) {
    return {
      success: false,
      error: `${module.displayName} is not available yet.`,
    };
  }

  if (moduleKey === "melusi") {
    return ensureMelusiLifeArea(supabase, userId);
  }

  return { success: false, error: "Could not initialize life area." };
}
