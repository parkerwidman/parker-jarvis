import "server-only";

import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type RemovedTransaction,
  type Transaction,
  type TransactionsSyncResponse,
} from "plaid";
import { getPlaidEnvironment, validatePlaidCredentials } from "./plaid-config";
import { PlaidSafeError } from "./plaid-types";

const PLAID_TIMEOUT_MS = 30_000;
export const PLAID_TRANSACTIONS_DAYS_REQUESTED = 730;
const PLAID_SYNC_PAGE_SIZE = 500;

function resolvePlaidBasePath(): string {
  const env = getPlaidEnvironment();

  switch (env) {
    case "production":
      return PlaidEnvironments.production;
    case "sandbox":
    default:
      return PlaidEnvironments.sandbox;
  }
}

let cachedClient: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (cachedClient) {
    return cachedClient;
  }

  validatePlaidCredentials();

  const configuration = new Configuration({
    basePath: resolvePlaidBasePath(),
    baseOptions: {
      timeout: PLAID_TIMEOUT_MS,
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  });

  cachedClient = new PlaidApi(configuration);
  return cachedClient;
}

const PLAID_RECONNECT_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_CREDENTIALS",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "MFA_NOT_SUPPORTED",
  "NO_ACCOUNTS",
]);

const PLAID_TOKEN_NOT_REPAIRABLE_ERROR_CODES = new Set([
  "ITEM_NOT_FOUND",
  "INVALID_ACCESS_TOKEN",
]);

const PLAID_ERROR_CODE_MAP: Record<string, PlaidSafeError["code"]> = {
  ITEM_LOGIN_REQUIRED: "reconnect_required",
  INVALID_ACCESS_TOKEN: "token_not_repairable",
  INVALID_CREDENTIALS: "reconnect_required",
  ITEM_LOCKED: "reconnect_required",
  USER_SETUP_REQUIRED: "reconnect_required",
  MFA_NOT_SUPPORTED: "reconnect_required",
  NO_ACCOUNTS: "reconnect_required",
  ITEM_NOT_FOUND: "token_not_repairable",
  PRODUCT_NOT_READY: "product_not_ready",
  TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION: "sync_mutation_during_pagination",
  RATE_LIMIT_EXCEEDED: "rate_limited",
  INSTITUTION_NOT_RESPONDING: "product_not_ready",
  INVALID_FIELD: "update_failed",
  INVALID_CONFIGURATION: "update_failed",
  INVALID_PRODUCT: "update_failed",
};

type PlaidApiErrorBody = {
  error_type?: string;
  error_code?: string;
  error_code_reason?: string | null;
  error_message?: string;
  request_id?: string;
};

export type PlaidApiFailureDetails = {
  operation: string;
  httpStatus: number | null;
  errorType: string | null;
  errorCode: string | null;
  errorCodeReason: string | null;
  errorMessage: string | null;
  requestId: string | null;
};

function sanitizePlaidErrorMessage(message: string | undefined): string | null {
  if (!message) {
    return null;
  }

  return message
    .replace(/access-(sandbox|production)-[A-Za-z0-9-]+/g, "[redacted]")
    .replace(/item-[A-Za-z0-9-]+/g, "[redacted]")
    .slice(0, 500);
}

export function extractPlaidApiFailure(
  error: unknown,
  operation: string,
): PlaidApiFailureDetails {
  const plaidError = error as {
    response?: { status?: number; data?: PlaidApiErrorBody };
  };

  const data = plaidError.response?.data;

  return {
    operation,
    httpStatus: plaidError.response?.status ?? null,
    errorType: data?.error_type ?? null,
    errorCode: data?.error_code ?? null,
    errorCodeReason: data?.error_code_reason ?? null,
    errorMessage: sanitizePlaidErrorMessage(data?.error_message),
    requestId: data?.request_id ?? null,
  };
}

export function logPlaidApiFailure(details: PlaidApiFailureDetails): void {
  console.error("[plaid] request failed", {
    operation: details.operation,
    http_status: details.httpStatus,
    error_type: details.errorType,
    error_code: details.errorCode,
    error_code_reason: details.errorCodeReason,
    error_message: details.errorMessage,
    request_id: details.requestId,
  });
}

export function mapPlaidApiError(
  error: unknown,
  operation = "plaid_request",
): PlaidSafeError {
  if (error instanceof PlaidSafeError) {
    return error;
  }

  const failure = extractPlaidApiFailure(error, operation);
  logPlaidApiFailure(failure);

  if (failure.errorCode) {
    const mappedCode = PLAID_ERROR_CODE_MAP[failure.errorCode] ?? "plaid_error";
    return new PlaidSafeError(mappedCode, mappedCode, failure.errorCode);
  }

  return new PlaidSafeError("plaid_error");
}

export function isPlaidReconnectErrorCode(plaidErrorCode: string | undefined): boolean {
  return Boolean(plaidErrorCode && PLAID_RECONNECT_ERROR_CODES.has(plaidErrorCode));
}

export function isPlaidTokenNotRepairableErrorCode(
  plaidErrorCode: string | undefined,
): boolean {
  return Boolean(
    plaidErrorCode && PLAID_TOKEN_NOT_REPAIRABLE_ERROR_CODES.has(plaidErrorCode),
  );
}

export type PlaidAccessTokenUpdateState = "repairable" | "not_repairable";

export async function classifyPlaidAccessTokenForUpdate(
  accessToken: string,
): Promise<PlaidAccessTokenUpdateState> {
  try {
    await verifyPlaidItemAccess(accessToken);
    return "repairable";
  } catch (error) {
    if (error instanceof PlaidSafeError) {
      if (error.code === "reconnect_required") {
        return "repairable";
      }

      if (error.code === "token_not_repairable") {
        return "not_repairable";
      }
    }

    throw error;
  }
}

export async function createLinkToken(clientUserId: string): Promise<{
  linkToken: string;
  expiration: string;
}> {
  const client = getPlaidClient();

  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: clientUserId },
      client_name: "Parker Jarvis",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      transactions: {
        days_requested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
      },
    });

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  } catch (error) {
    throw mapPlaidApiError(error, "link_token_create");
  }
}

export async function createUpdateLinkToken(
  clientUserId: string,
  accessToken: string,
): Promise<{
  linkToken: string;
  expiration: string;
}> {
  const client = getPlaidClient();

  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: clientUserId },
      client_name: "Parker Jarvis",
      country_codes: [CountryCode.Us],
      language: "en",
      access_token: accessToken,
    });

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  } catch (error) {
    throw mapPlaidApiError(error, "link_token_create_update");
  }
}

export async function verifyPlaidItemAccess(accessToken: string): Promise<void> {
  const client = getPlaidClient();

  try {
    await client.itemGet({ access_token: accessToken });
  } catch (error) {
    throw mapPlaidApiError(error, "item_get");
  }
}

export async function exchangePublicToken(publicToken: string): Promise<{
  accessToken: string;
  itemId: string;
}> {
  const client = getPlaidClient();

  try {
    const response = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

export async function removePlaidItem(accessToken: string): Promise<void> {
  const client = getPlaidClient();

  try {
    await client.itemRemove({ access_token: accessToken });
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

export async function fetchItemInstitutionId(
  accessToken: string,
): Promise<string | null> {
  const client = getPlaidClient();

  try {
    const response = await client.itemGet({ access_token: accessToken });
    return response.data.item.institution_id ?? null;
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

export async function fetchInstitutionName(
  institutionId: string,
): Promise<{ institutionId: string; institutionName: string | null }> {
  const client = getPlaidClient();

  try {
    const response = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });

    return {
      institutionId,
      institutionName: response.data.institution.name ?? null,
    };
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

export async function fetchPlaidAccounts(
  accessToken: string,
): Promise<AccountBase[]> {
  const client = getPlaidClient();

  try {
    const response = await client.accountsGet({ access_token: accessToken });
    return response.data.accounts;
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

export type PlaidTransactionsSyncPage = {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
  hasMore: boolean;
};

export async function fetchPlaidTransactionsSyncPage(
  accessToken: string,
  cursor?: string | null,
): Promise<PlaidTransactionsSyncPage> {
  const client = getPlaidClient();

  try {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
      count: PLAID_SYNC_PAGE_SIZE,
    });

    return mapTransactionsSyncResponse(response.data);
  } catch (error) {
    throw mapPlaidApiError(error);
  }
}

function mapTransactionsSyncResponse(
  response: TransactionsSyncResponse,
): PlaidTransactionsSyncPage {
  return {
    added: response.added,
    modified: response.modified,
    removed: response.removed,
    nextCursor: response.next_cursor,
    hasMore: response.has_more,
  };
}
