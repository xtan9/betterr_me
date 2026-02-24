"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { RecurringBill, ViewMode } from "@/lib/db/types";

interface BillsSummary {
  total_monthly_cents: number;
  bill_count: number;
  pending_count: number;
}

interface BillsResponse {
  bills: RecurringBill[];
  summary: BillsSummary;
}

/**
 * SWR hook for fetching recurring bills with summary stats.
 * Uses keepPreviousData for smooth transitions.
 *
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useBills(view: ViewMode = "mine") {
  const { data, error, mutate } = useSWR<BillsResponse>(
    `/api/money/bills?view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    bills: data?.bills ?? [],
    summary: data?.summary ?? null,
    isLoading,
    error,
    mutate,
  };
}
