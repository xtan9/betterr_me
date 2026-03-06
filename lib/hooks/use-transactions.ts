"use client";

import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/fetcher";
import type { Transaction, ViewMode } from "@/lib/db/types";

const PAGE_SIZE = 50;

export interface TransactionFilters {
  search?: string;
  category_id?: string;
  account_id?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: string;
  amount_max?: string;
}

interface TransactionPage {
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
}

/**
 * @param filters - Transaction filter criteria
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useTransactions(filters: TransactionFilters, view: ViewMode = "mine") {
  const getKey = (
    pageIndex: number,
    previousPageData: TransactionPage | null
  ) => {
    if (previousPageData && !previousPageData.hasMore) return null;

    const params = new URLSearchParams();
    // Add all non-empty filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set("view", view);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageIndex * PAGE_SIZE));
    return `/api/money/transactions?${params.toString()}`;
  };

  // Only destructure data, error, size, setSize, mutate — NOT isLoading or isValidating.
  // SWR uses getter-based dependency tracking: accessing isLoading/isValidating
  // registers them as dependencies, causing re-renders on every background
  // revalidation cycle. By not accessing them, SWR skips those re-renders.
  const { data, error, size, setSize, mutate } =
    useSWRInfinite<TransactionPage>(getKey, fetcher, {
      revalidateFirstPage: false,
    });

  const transactions = data ? data.flatMap((page) => page.transactions) : [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = transactions.length < total;
  // Derive loading states from data shape instead of SWR flags.
  const isLoading = !data && !error;
  const isLoadingMore =
    size > 0 && data ? typeof data[size - 1] === "undefined" : false;

  return {
    transactions,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}
