import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { RoutineWithExercises } from "@/lib/db/types";

/**
 * SWR hook for fetching user routines with nested exercises.
 * 30s dedup interval to avoid redundant refetches.
 */
export function useRoutines() {
  const { data, error, isLoading, mutate } = useSWR<{
    routines: RoutineWithExercises[];
  }>("/api/routines", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    routines: data?.routines ?? [],
    error,
    isLoading,
    mutate,
  };
}
