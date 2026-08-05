import type { FinanceCategoryKind } from "./finance-types";

export type FinanceSystemCategorySeed = {
  name: string;
  slug: string;
  categoryKind: FinanceCategoryKind;
  sortOrder: number;
};

export const FINANCE_SYSTEM_CATEGORY_SEEDS: readonly FinanceSystemCategorySeed[] = [
  { name: "Income", slug: "income", categoryKind: "income", sortOrder: 10 },
  { name: "Housing", slug: "housing", categoryKind: "expense", sortOrder: 20 },
  { name: "Food", slug: "food", categoryKind: "expense", sortOrder: 30 },
  {
    name: "Transportation",
    slug: "transportation",
    categoryKind: "expense",
    sortOrder: 40,
  },
  { name: "Shopping", slug: "shopping", categoryKind: "expense", sortOrder: 50 },
  {
    name: "Entertainment",
    slug: "entertainment",
    categoryKind: "expense",
    sortOrder: 60,
  },
  { name: "Health", slug: "health", categoryKind: "expense", sortOrder: 70 },
  {
    name: "Education",
    slug: "education",
    categoryKind: "expense",
    sortOrder: 80,
  },
  {
    name: "Subscriptions",
    slug: "subscriptions",
    categoryKind: "expense",
    sortOrder: 90,
  },
  { name: "Travel", slug: "travel", categoryKind: "expense", sortOrder: 100 },
  {
    name: "Personal Care",
    slug: "personal-care",
    categoryKind: "expense",
    sortOrder: 110,
  },
  { name: "Business", slug: "business", categoryKind: "expense", sortOrder: 120 },
  {
    name: "Debt Payments",
    slug: "debt-payments",
    categoryKind: "expense",
    sortOrder: 130,
  },
  { name: "Savings", slug: "savings", categoryKind: "expense", sortOrder: 140 },
  {
    name: "Transfers",
    slug: "transfers",
    categoryKind: "transfer",
    sortOrder: 150,
  },
  { name: "Fees", slug: "fees", categoryKind: "expense", sortOrder: 160 },
  {
    name: "Uncategorized",
    slug: "uncategorized",
    categoryKind: "neutral",
    sortOrder: 170,
  },
];

export function getMissingFinanceSystemCategorySeeds(
  existingSlugs: readonly string[],
): FinanceSystemCategorySeed[] {
  const slugSet = new Set(existingSlugs.map((slug) => slug.toLowerCase()));

  return FINANCE_SYSTEM_CATEGORY_SEEDS.filter(
    (seed) => !slugSet.has(seed.slug.toLowerCase()),
  );
}
