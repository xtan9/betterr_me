import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { BankConnection, MoneyAccount } from "@/lib/db/types";
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
 */
export function useAccounts() {
  const { data, error, isLoading, mutate } = useSWR<AccountsResponse>(
    "/api/money/accounts",
    fetcher,
    { keepPreviousData: true }
  );

  return {
    connections: data?.connections ?? [],
    netWorthCents: data?.net_worth_cents ?? 0,
    error,
    isLoading,
    mutate,
  };
}
