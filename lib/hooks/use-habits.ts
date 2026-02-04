import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Habit, HabitStatus, HabitWithTodayStatus } from "@/lib/db/types";

export function useHabits(filters?: { status?: HabitStatus; withToday?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.withToday) params.set("with_today", "true");

  const { data, error, isLoading, mutate } = useSWR<{ habits: HabitWithTodayStatus[] }>(
    `/api/habits?${params}`,
    fetcher
  );

  return {
    habits: data?.habits ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useHabit(habitId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ habit: Habit }>(
    habitId ? `/api/habits/${habitId}` : null,
    fetcher
  );

  return {
    habit: data?.habit ?? null,
    error,
    isLoading,
    mutate,
  };
}
