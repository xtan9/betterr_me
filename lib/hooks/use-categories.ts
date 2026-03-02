"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Category } from "@/lib/db/types";

export function useCategories() {
  const { data, error, mutate } = useSWR<{
    categories: Category[];
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
