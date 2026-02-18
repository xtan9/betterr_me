import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";

interface SidebarCounts {
  habits_incomplete: number;
  tasks_due: number;
}

export function useSidebarCounts() {
  const date = getLocalDateString();
  const { data, error, isLoading, mutate } = useSWR<SidebarCounts>(
    `/api/sidebar/counts?date=${date}`,
    fetcher,
    {
      refreshInterval: 300_000, // 5 minutes -- badges are informational
      revalidateOnFocus: false, // Don't refetch on tab switch
      dedupingInterval: 60_000, // 1 minute dedup window
      keepPreviousData: true, // Prevent flash when date changes at midnight
    }
  );

  return {
    habitsIncomplete: data?.habits_incomplete ?? 0,
    tasksDue: data?.tasks_due ?? 0,
    isLoading,
    error,
    mutate,
  };
}
