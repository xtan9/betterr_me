"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Category } from "@/lib/db/types";

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<{
    categories: Category[];
  }>("/api/money/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    categories: data?.categories ?? [],
    isLoading,
    error,
    mutate,
  };
}
