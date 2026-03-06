import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

/**
 * Create a Plaid API client configured from environment variables.
 *
 * NOT a singleton — follows project convention (create new instances per request,
 * not module-level singletons) to avoid environment variable issues during testing.
 */
export function createPlaidClient(): PlaidApi {
  const configuration = new Configuration({
    basePath:
      PlaidEnvironments[
        process.env.PLAID_ENV as "sandbox" | "production"
      ] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
        "Plaid-Version": "2020-09-14",
      },
    },
  });
  return new PlaidApi(configuration);
}
