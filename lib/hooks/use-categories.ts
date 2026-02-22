import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Category } from "@/lib/db/types";

// Static SWR key — no date dependency, so keepPreviousData is not needed
export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<{ categories: Category[] }>(
    "/api/categories",
    fetcher
  );

  return {
    categories: data?.categories ?? [],
    error,
    isLoading,
    mutate,
  };
}
