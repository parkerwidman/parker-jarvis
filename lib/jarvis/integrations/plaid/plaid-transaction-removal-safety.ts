import "server-only";

export type PlaidMappedTransactionSource = "plaid" | "rocket_money_csv" | "manual" | "unknown";

export type PlaidMappingRemovalDecision =
  | { action: "void_transaction" }
  | { action: "remove_mapping_only" }
  | { action: "fail_closed" };

export function classifyPlaidMappedTransactionSource(
  source: string | null | undefined,
): PlaidMappedTransactionSource {
  if (source === "plaid" || source === "rocket_money_csv" || source === "manual") {
    return source;
  }

  return "unknown";
}

export function resolvePlaidMappingRemovalDecision(
  source: string | null | undefined,
): PlaidMappingRemovalDecision {
  const classified = classifyPlaidMappedTransactionSource(source);

  switch (classified) {
    case "plaid":
      return { action: "void_transaction" };
    case "rocket_money_csv":
      return { action: "remove_mapping_only" };
    case "manual":
    case "unknown":
    default:
      return { action: "fail_closed" };
  }
}
