import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { HabitLog } from "@/lib/db/types";

export function useHabitLogs(habitId: string | null, days: number = 30) {
  const { data, error, isLoading, mutate } = useSWR<{ logs: HabitLog[] }>(
    habitId ? `/api/habits/${habitId}/logs?days=${days}` : null,
    fetcher
  );

  return {
    logs: data?.logs ?? [],
    error,
    isLoading,
    mutate,
  };
}
