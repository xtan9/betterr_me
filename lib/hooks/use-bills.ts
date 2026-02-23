"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { RecurringBill } from "@/lib/db/types";

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
 */
export function useBills() {
  const { data, error, mutate } = useSWR<BillsResponse>(
    "/api/money/bills",
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
