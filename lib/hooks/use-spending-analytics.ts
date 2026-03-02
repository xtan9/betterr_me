"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { ViewMode } from "@/lib/db/types";

interface CategorySpending {
  category_id: string;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  total_cents: number;
}

interface MonthlyTrend {
  month: string;
  total_cents: number;
  budget_total_cents: number;
  categories: { category_id: string; total_cents: number }[];
}

/**
 * SWR hook for fetching spending analytics by category for a specific month.
 * Uses keepPreviousData to prevent skeleton flash when navigating between months.
 *
 * @param month - YYYY-MM format string (e.g., "2026-02")
 */
export function useSpendingAnalytics(month: string) {
  const { data, error } = useSWR<{ spending: CategorySpending[] }>(
    month ? `/api/money/analytics/spending?month=${month}` : null,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    spending: data?.spending ?? [],
    isLoading,
    error,
  };
}

/**
 * SWR hook for fetching spending trends over the last N months.
 * Uses keepPreviousData for smooth data transitions.
 *
 * @param months - Number of months to include (default 12, max 24)
 */
export function useSpendingTrends(months: number = 12, view: ViewMode = "mine") {
  const { data, error } = useSWR<{ trends: MonthlyTrend[] }>(
    `/api/money/analytics/spending?type=trends&months=${months}&view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    trends: data?.trends ?? [],
    isLoading,
    error,
  };
}
