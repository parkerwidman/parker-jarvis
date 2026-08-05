import "server-only";

import {
  FINANCE_DEFAULT_PREFERENCES,
  type FinancePreferences,
} from "@/lib/jarvis/finance/finance-types";
import { getMissingFinanceSystemCategorySeeds } from "@/lib/jarvis/finance/finance-category-seed";
import { ensureFinanceLifeArea } from "@/lib/jarvis/life-areas/ensure-finance-life-area";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureFinanceFoundationResult =
  | {
      success: true;
      lifeAreaId: string;
      preferences: FinancePreferences;
      seededCategoryCount: number;
    }
  | { success: false; error: string };

type FinancePreferencesRow = {
  user_id: string;
  default_currency: "USD";
  minimum_cash_target: number | null;
  monthly_spending_limit: number | null;
  monthly_income_target: number | null;
  large_transaction_threshold: number | null;
  stale_balance_days: number;
  default_reminder_days: number;
  exclude_business_from_personal: boolean;
  created_at: string;
  updated_at: string;
};

function mapFinancePreferencesRow(row: FinancePreferencesRow): FinancePreferences {
  return {
    userId: row.user_id,
    defaultCurrency: row.default_currency,
    minimumCashTarget: row.minimum_cash_target,
    monthlySpendingLimit: row.monthly_spending_limit,
    monthlyIncomeTarget: row.monthly_income_target,
    largeTransactionThreshold: row.large_transaction_threshold,
    staleBalanceDays: row.stale_balance_days,
    defaultReminderDays: row.default_reminder_days,
    excludeBusinessFromPersonal: row.exclude_business_from_personal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureFinancePreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ preferences: FinancePreferences | null; error: string | null }> {
  const { data: existing, error: lookupError } = await supabase
    .from("finance_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    return { preferences: null, error: "Could not initialize finance preferences." };
  }

  if (existing) {
    return {
      preferences: mapFinancePreferencesRow(existing as FinancePreferencesRow),
      error: null,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("finance_preferences")
    .insert({
      user_id: userId,
      default_currency: FINANCE_DEFAULT_PREFERENCES.defaultCurrency,
      minimum_cash_target: FINANCE_DEFAULT_PREFERENCES.minimumCashTarget,
      monthly_spending_limit: FINANCE_DEFAULT_PREFERENCES.monthlySpendingLimit,
      monthly_income_target: FINANCE_DEFAULT_PREFERENCES.monthlyIncomeTarget,
      large_transaction_threshold:
        FINANCE_DEFAULT_PREFERENCES.largeTransactionThreshold,
      stale_balance_days: FINANCE_DEFAULT_PREFERENCES.staleBalanceDays,
      default_reminder_days: FINANCE_DEFAULT_PREFERENCES.defaultReminderDays,
      exclude_business_from_personal:
        FINANCE_DEFAULT_PREFERENCES.excludeBusinessFromPersonal,
    })
    .select("*")
    .single();

  if (!insertError && created) {
    return {
      preferences: mapFinancePreferencesRow(created as FinancePreferencesRow),
      error: null,
    };
  }

  const { data: retry, error: retryError } = await supabase
    .from("finance_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!retryError && retry) {
    return {
      preferences: mapFinancePreferencesRow(retry as FinancePreferencesRow),
      error: null,
    };
  }

  return { preferences: null, error: "Could not initialize finance preferences." };
}

async function seedFinanceSystemCategories(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ seededCategoryCount: number; error: string | null }> {
  const { data: existingCategories, error: lookupError } = await supabase
    .from("finance_categories")
    .select("slug")
    .eq("user_id", userId);

  if (lookupError) {
    return {
      seededCategoryCount: 0,
      error: "Could not seed finance categories.",
    };
  }

  const missingSeeds = getMissingFinanceSystemCategorySeeds(
    (existingCategories ?? []).map((category) => category.slug),
  );

  if (missingSeeds.length === 0) {
    return { seededCategoryCount: 0, error: null };
  }

  const { error: insertError } = await supabase.from("finance_categories").insert(
    missingSeeds.map((seed) => ({
      user_id: userId,
      name: seed.name,
      slug: seed.slug,
      category_kind: seed.categoryKind,
      is_system: true,
      sort_order: seed.sortOrder,
      active: true,
    })),
  );

  if (insertError) {
    const { data: retryCategories, error: retryError } = await supabase
      .from("finance_categories")
      .select("slug")
      .eq("user_id", userId);

    if (retryError) {
      return {
        seededCategoryCount: 0,
        error: "Could not seed finance categories.",
      };
    }

    const remaining = getMissingFinanceSystemCategorySeeds(
      (retryCategories ?? []).map((category) => category.slug),
    );

    if (remaining.length > 0) {
      return {
        seededCategoryCount: 0,
        error: "Could not seed finance categories.",
      };
    }

    return {
      seededCategoryCount: missingSeeds.length - remaining.length,
      error: null,
    };
  }

  return { seededCategoryCount: missingSeeds.length, error: null };
}

export async function ensureFinanceFoundation(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnsureFinanceFoundationResult> {
  const lifeAreaResult = await ensureFinanceLifeArea(supabase, userId);

  if (!lifeAreaResult.success) {
    return lifeAreaResult;
  }

  const preferencesResult = await ensureFinancePreferences(supabase, userId);

  if (preferencesResult.error || !preferencesResult.preferences) {
    return {
      success: false,
      error: preferencesResult.error ?? "Could not initialize finance preferences.",
    };
  }

  const categoryResult = await seedFinanceSystemCategories(supabase, userId);

  if (categoryResult.error) {
    return { success: false, error: categoryResult.error };
  }

  return {
    success: true,
    lifeAreaId: lifeAreaResult.lifeAreaId,
    preferences: preferencesResult.preferences,
    seededCategoryCount: categoryResult.seededCategoryCount,
  };
}
