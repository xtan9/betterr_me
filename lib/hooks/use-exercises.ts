import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Exercise } from "@/lib/db/types";

// Static SWR key — no date dependency. Long dedup because exercises rarely change.
export function useExercises() {
  const { data, error, isLoading, mutate } = useSWR<{
    exercises: Exercise[];
  }>("/api/exercises", fetcher, {
    dedupingInterval: 600000, // 10 min cache
  });

  return {
    exercises: data?.exercises ?? [],
    error,
    isLoading,
    mutate,
  };
}
