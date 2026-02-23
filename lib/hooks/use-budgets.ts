"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { BudgetWithCategories } from "@/lib/db/types";

/**
 * SWR hook for fetching budget data for a given month.
 * Uses keepPreviousData to prevent skeleton flash when navigating between months.
 *
 * @param month - YYYY-MM format string (e.g., "2026-02")
 */
export function useBudget(month: string) {
  const { data, error, mutate } = useSWR<{
    budget: BudgetWithCategories | null;
  }>(month ? `/api/money/budgets?month=${month}` : null, fetcher, {
    keepPreviousData: true,
  });

  const isLoading = !data && !error;

  return {
    budget: data?.budget ?? null,
    isLoading,
    error,
    mutate,
  };
}
