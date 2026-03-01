import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { WorkoutSummary } from "@/lib/db/workouts";

/**
 * SWR hook for fetching completed workout history with enriched summaries.
 * Uses keepPreviousData for smooth pagination transitions.
 * 30s dedup interval to match useRoutines pattern.
 */
export function useWorkouts(options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const { data, error, isLoading, mutate } = useSWR<WorkoutSummary[]>(
    `/api/workouts?limit=${limit}&offset=${offset}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
      keepPreviousData: true,
    }
  );

  return {
    workouts: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
