"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { MoneyCategory } from "@/lib/db/types";

export function useMoneyCategories() {
  const { data, error, mutate } = useSWR<{
    categories: MoneyCategory[];
  }>("/api/money/categories", fetcher, {
    dedupingInterval: 60000,
  });

  const isLoading = !data && !error;

  return {
    categories: data?.categories ?? [],
    isLoading,
    error,
    mutate,
  };
}
