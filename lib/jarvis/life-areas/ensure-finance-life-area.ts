import "server-only";

import { getLifeAreaModule } from "@/lib/jarvis/life-areas/module-registry";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureFinanceLifeAreaResult =
  | { success: true; lifeAreaId: string }
  | { success: false; error: string };

export async function ensureFinanceLifeArea(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnsureFinanceLifeAreaResult> {
  const module = getLifeAreaModule("finance");

  const { data: existing, error: lookupError } = await supabase
    .from("life_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("name", module.lifeAreaName)
    .maybeSingle();

  if (lookupError) {
    return { success: false, error: "Could not initialize Finance life area." };
  }

  if (existing?.id) {
    return { success: true, lifeAreaId: existing.id };
  }

  const { data: created, error: insertError } = await supabase
    .from("life_areas")
    .insert({
      user_id: userId,
      name: module.lifeAreaName,
      description: module.purpose,
      active: true,
    })
    .select("id")
    .single();

  if (!insertError && created?.id) {
    return { success: true, lifeAreaId: created.id };
  }

  const { data: retry, error: retryError } = await supabase
    .from("life_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("name", module.lifeAreaName)
    .maybeSingle();

  if (!retryError && retry?.id) {
    return { success: true, lifeAreaId: retry.id };
  }

  return { success: false, error: "Could not initialize Finance life area." };
}
