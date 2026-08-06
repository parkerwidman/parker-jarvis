import "server-only";

import type { PlaidEnvironment } from "./plaid-types";
import { PlaidSafeError } from "./plaid-types";

export const PLAID_CLIENT_NAME = "Parker Jarvis";
export const PLAID_PRODUCTS = ["transactions"] as const;
export const PLAID_COUNTRY_CODES = ["US"] as const;
export const PLAID_LANGUAGE = "en";

const VALID_ENVIRONMENTS: PlaidEnvironment[] = ["sandbox", "production"];

function requiresExplicitPlaidEnvironment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function getPlaidEnvironment(): PlaidEnvironment {
  const env = process.env.PLAID_ENV?.toLowerCase();

  if (!env) {
    if (requiresExplicitPlaidEnvironment()) {
      throw new PlaidSafeError("invalid_runtime_environment");
    }

    return "sandbox";
  }

  if (!VALID_ENVIRONMENTS.includes(env as PlaidEnvironment)) {
    throw new PlaidSafeError("invalid_runtime_environment");
  }

  return env as PlaidEnvironment;
}

export function validatePlaidCredentials(): void {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new PlaidSafeError("missing_server_configuration");
  }
}
