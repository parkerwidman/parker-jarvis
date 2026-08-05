import "server-only";

import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import { getPlaidEnvironment, validatePlaidCredentials } from "./plaid-config";
import { PlaidSafeError } from "./plaid-types";

const PLAID_TIMEOUT_MS = 30_000;

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

export function mapPlaidApiError(error: unknown): PlaidSafeError {
  if (error instanceof PlaidSafeError) {
    return error;
  }

  const plaidError = error as {
    response?: { data?: { error_code?: string; request_id?: string } };
  };

  const requestId = plaidError.response?.data?.request_id;
  if (requestId) {
    console.error("[plaid] request failed", { request_id: requestId });
  }

  return new PlaidSafeError("plaid_error");
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
    });

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  } catch (error) {
    throw mapPlaidApiError(error);
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
