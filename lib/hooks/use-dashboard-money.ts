"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";
import type {
  DailyBalance,
  DetectedIncome,
  ConfirmedIncomePattern,
  ViewMode,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Response type matching dashboard API
// ---------------------------------------------------------------------------

interface IncomeStatus {
  detected: DetectedIncome[] | null;
  confirmed: ConfirmedIncomePattern[] | null;
  needs_confirmation: boolean;
}

export interface DashboardMoneyData {
  available_cents: number;
  upcoming_bills_total_cents: number;
  end_of_month_balance_cents: number;
  daily_spending_rate_cents: number;
  daily_balances: DailyBalance[];
  upcoming_bills: {
    merchant_name: string;
    amount_cents: number;
    due_date: string;
  }[];
  income_status: IncomeStatus;
  has_confirmed_income: boolean;
  confidence_label: "estimated" | "based on confirmed income";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * SWR hook for the money dashboard aggregated data.
 * Uses keepPreviousData since the SWR key contains a date (project convention).
 *
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useDashboardMoney(view: ViewMode = "mine") {
  const date = getLocalDateString();
  const { data, error, mutate } = useSWR<DashboardMoneyData>(
    `/api/money/dashboard?date=${date}&view=${view}`,
    fetcher,
    { keepPreviousData: true }
  );

  const isLoading = !data && !error;

  return {
    dashboard: data ?? null,
    isLoading,
    error,
    mutate,
  };
}
