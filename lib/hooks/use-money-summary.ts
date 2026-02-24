"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Response type matching summary API
// ---------------------------------------------------------------------------

interface MoneySummary {
  spent_today_cents: number;
  spent_this_week_cents: number;
  budget_total_cents: number | null;
  has_accounts: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Independent SWR hook for the money summary card on the main dashboard.
 * Uses its own SWR key so it does NOT block habits/tasks loading.
 *
 * Configuration:
 * - shouldRetryOnError: false — don't spam the server if money feature is unavailable
 * - revalidateOnFocus: false — summary data doesn't change on tab switch
 * - refreshInterval: 5min — background refresh for spending pulse
 */
export function useMoneySummary() {
  const date = getLocalDateString();
  const { data, error } = useSWR<MoneySummary>(
    `/api/money/dashboard/summary?date=${date}`,
    fetcher,
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      refreshInterval: 300_000,
    }
  );

  const isLoading = !data && !error;

  return {
    summary: data ?? null,
    isLoading,
    hasAccounts: data?.has_accounts ?? false,
  };
}
