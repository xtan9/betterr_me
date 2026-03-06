import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

/**
 * Create a Plaid API client configured from environment variables.
 *
 * NOT a singleton — follows project convention (create new instances per request,
 * not module-level singletons) to avoid environment variable issues during testing.
 */
export function createPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "Missing PLAID_CLIENT_ID or PLAID_SECRET environment variables"
    );
  }

  const configuration = new Configuration({
    basePath:
      PlaidEnvironments[
        process.env.PLAID_ENV as "sandbox" | "production"
      ] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14",
      },
    },
  });
  return new PlaidApi(configuration);
}
