"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { NetWorthSnapshot, ViewMode } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetWorthResponse {
  net_worth_cents: number;
  assets_cents: number;
  liabilities_cents: number;
  manual_assets_cents: number;
  change: {
    amount_cents: number;
    percent: number;
    vs_date: string;
  } | null;
  accounts_by_type: Record<string, number>;
}

interface SnapshotWithLabel extends NetWorthSnapshot {
  label: string;
}

// ---------------------------------------------------------------------------
// useNetWorth
// ---------------------------------------------------------------------------

/**
 * SWR hook for fetching current net worth with asset/liability breakdown.
 *
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useNetWorth(view: ViewMode = "mine") {
  const { data, error, mutate } = useSWR<NetWorthResponse>(
    `/api/money/net-worth?view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    netWorth: data ?? null,
    isLoading,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// useNetWorthHistory
// ---------------------------------------------------------------------------

/**
 * SWR hook for fetching historical net worth snapshots.
 * Uses keepPreviousData for smooth chart transitions when switching periods.
 *
 * @param period - "1M" | "3M" | "6M" | "1Y" | "ALL"
 */
export function useNetWorthHistory(period: string) {
  const { data, error, mutate } = useSWR<{
    snapshots: SnapshotWithLabel[];
  }>(`/api/money/net-worth/snapshots?period=${period}`, fetcher, {
    keepPreviousData: true,
  });

  const isLoading = !data && !error;

  return {
    snapshots: data?.snapshots ?? [],
    isLoading,
    error,
    mutate,
  };
}
