import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { BankConnection, MoneyAccount, ViewMode } from "@/lib/db/types";
import type { SyncStatus } from "@/lib/plaid/types";

/**
 * A bank connection with its accounts and derived sync status.
 */
export interface ConnectionWithAccounts extends BankConnection {
  accounts: MoneyAccount[];
  sync_status: SyncStatus;
}

/**
 * Response shape from /api/money/accounts.
 */
export interface AccountsResponse {
  connections: ConnectionWithAccounts[];
  net_worth_cents: number;
}

/**
 * SWR hook for fetching connected bank accounts.
 * Returns connections grouped by institution with net worth total.
 *
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useAccounts(view: ViewMode = "mine") {
  // Only destructure data, error, mutate — NOT isValidating or isLoading.
  // SWR uses getter-based dependency tracking: accessing isValidating
  // registers it as a dependency, causing re-renders on every background
  // revalidation cycle (isValidating flips true→false). By not accessing
  // it, SWR skips those re-renders entirely.
  const { data, error, mutate } = useSWR<AccountsResponse>(
    `/api/money/accounts?view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );

  // Derive loading state from data/error instead of SWR's built-in isLoading.
  // SWR's isLoading flaps true↔false on every retry attempt when data is
  // undefined, causing skeleton↔empty-state flashing. This stays stable:
  // true until first response (success or error), then false forever.
  const isLoading = !data && !error;

  return {
    connections: data?.connections ?? [],
    netWorthCents: data?.net_worth_cents ?? 0,
    error,
    isLoading,
    mutate,
  };
}
