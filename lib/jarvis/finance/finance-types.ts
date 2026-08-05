export type FinanceAccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "investment"
  | "loan"
  | "other";

export type FinanceCategoryKind = "income" | "expense" | "transfer" | "neutral";

export type FinanceTransactionType =
  | "income"
  | "expense"
  | "refund"
  | "transfer"
  | "adjustment";

export type FinanceTransactionStatus = "pending" | "posted" | "void";

export type FinancePersonalOrBusiness = "personal" | "business" | "unclassified";

export type FinanceRecurringType =
  | "bill"
  | "subscription"
  | "expected_income"
  | "debt_payment"
  | "savings_contribution";

export type FinanceAmountVariability = "fixed" | "variable" | "estimate";

export type FinanceFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "annual";

export type FinanceAccount = {
  id: string;
  userId: string;
  name: string;
  institutionName: string | null;
  accountType: FinanceAccountType;
  currentBalance: number;
  availableBalance: number | null;
  balanceAsOf: string;
  currency: "USD";
  lastFour: string | null;
  active: boolean;
  hidden: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceCategory = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  categoryKind: FinanceCategoryKind;
  isSystem: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceTransaction = {
  id: string;
  userId: string;
  accountId: string | null;
  categoryId: string | null;
  transactionDate: string;
  postedDate: string | null;
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionType: FinanceTransactionType;
  status: FinanceTransactionStatus;
  notes: string | null;
  source: "manual";
  deduplicationFingerprint: string | null;
  recurringItemId: string | null;
  personalOrBusiness: FinancePersonalOrBusiness;
  createdAt: string;
  updatedAt: string;
};

export type FinanceRecurringItem = {
  id: string;
  userId: string;
  name: string;
  recurringType: FinanceRecurringType;
  expectedAmount: number;
  amountVariability: FinanceAmountVariability;
  frequency: FinanceFrequency;
  nextExpectedDate: string;
  accountId: string | null;
  categoryId: string | null;
  autopay: boolean;
  active: boolean;
  reminderDays: number;
  endDate: string | null;
  notes: string | null;
  source: "manual";
  createdAt: string;
  updatedAt: string;
};

export type FinancePreferences = {
  userId: string;
  defaultCurrency: "USD";
  minimumCashTarget: number | null;
  monthlySpendingLimit: number | null;
  monthlyIncomeTarget: number | null;
  largeTransactionThreshold: number | null;
  staleBalanceDays: number;
  defaultReminderDays: number;
  excludeBusinessFromPersonal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceCalculationInput = {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  recurringItems: FinanceRecurringItem[];
  preferences: FinancePreferences;
  timeZone: string;
  now?: Date;
  month?: { year: number; month: number };
};

export type FinanceCalculatedSummary = {
  totalCash: number | null;
  availableCash: number | null;
  creditCardBalance: number | null;
  totalDebt: number | null;
  currentMonthIncome: number | null;
  currentMonthSpending: number | null;
  currentMonthNetCashFlow: number | null;
  categorySpending: Record<string, number>;
  upcomingObligations: FinanceRecurringItem[];
  staleAccounts: FinanceAccount[];
};

export type FinanceAlertKind =
  | "recurring_due_soon"
  | "cash_below_target"
  | "large_transaction"
  | "uncategorized_transaction"
  | "stale_balance"
  | "possible_duplicate"
  | "monthly_spending_above_limit";

export type FinanceAlert = {
  kind: FinanceAlertKind;
  title: string;
  explanation: string;
  accountId?: string;
  transactionId?: string;
  recurringItemId?: string;
  categoryId?: string;
};

export const CASH_ACCOUNT_TYPES: readonly FinanceAccountType[] = [
  "checking",
  "savings",
  "cash",
];

export const DEBT_ACCOUNT_TYPES: readonly FinanceAccountType[] = [
  "credit_card",
  "loan",
];

export const FINANCE_DEFAULT_PREFERENCES: Omit<
  FinancePreferences,
  "userId" | "createdAt" | "updatedAt"
> = {
  defaultCurrency: "USD",
  minimumCashTarget: null,
  monthlySpendingLimit: null,
  monthlyIncomeTarget: null,
  largeTransactionThreshold: null,
  staleBalanceDays: 7,
  defaultReminderDays: 3,
  excludeBusinessFromPersonal: true,
};
