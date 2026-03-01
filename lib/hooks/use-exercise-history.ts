import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { ExerciseHistoryEntry, PersonalRecord } from "@/lib/db/types";

/**
 * SWR hook for fetching exercise progression data (per-workout aggregated stats).
 * Uses conditional fetching — pass null exerciseId to skip.
 * keepPreviousData prevents flash when switching date ranges.
 */
export function useExerciseHistory(
  exerciseId: string | null,
  options?: { since?: string }
) {
  const since = options?.since;
  const key = exerciseId
    ? `/api/exercises/${exerciseId}/history${since ? `?since=${since}` : ""}`
    : null;

  const { data, error, isLoading } = useSWR<ExerciseHistoryEntry[]>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  return {
    history: data ?? [],
    error,
    isLoading,
  };
}

/**
 * SWR hook for fetching exercise personal records.
 * Uses conditional fetching — pass null exerciseId to skip.
 * 60s dedup interval since PRs change rarely.
 */
export function useExerciseRecords(exerciseId: string | null) {
  const key = exerciseId
    ? `/api/exercises/${exerciseId}/records`
    : null;

  const { data, error, isLoading } = useSWR<PersonalRecord>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  return {
    records: data ?? null,
    error,
    isLoading,
  };
}
