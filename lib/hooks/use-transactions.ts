"use client";

import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/fetcher";
import type { Transaction } from "@/lib/db/types";

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

export function useTransactions(filters: TransactionFilters) {
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
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageIndex * PAGE_SIZE));
    return `/api/money/transactions?${params.toString()}`;
  };

  const { data, error, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<TransactionPage>(getKey, fetcher, {
      keepPreviousData: true,
      revalidateFirstPage: false,
    });

  const transactions = data ? data.flatMap((page) => page.transactions) : [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = transactions.length < total;
  const isLoadingMore = isValidating && size > 1;

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
