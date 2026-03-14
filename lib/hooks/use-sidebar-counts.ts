import useSWR, { mutate } from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";

interface SidebarCounts {
  habits_incomplete: number;
  tasks_due: number;
}

/** Revalidate sidebar counts from anywhere (e.g. after toggling a habit/task). */
export function revalidateSidebarCounts() {
  const date = getLocalDateString();
  mutate(`/api/sidebar/counts?date=${date}`).catch(() => {});
}

// Sidebar counts intentionally always use "mine" view — these are personal
// habits/tasks and are not affected by household view mode.
export function useSidebarCounts() {
  const date = getLocalDateString();
  const { data, error, mutate } = useSWR<SidebarCounts>(
    `/api/sidebar/counts?date=${date}`,
    fetcher,
    {
      refreshInterval: 300_000, // 5 minutes -- badges are informational
      dedupingInterval: 60_000, // 1 minute dedup window
    }
  );

  const isLoading = !data && !error;

  return {
    habitsIncomplete: data?.habits_incomplete ?? 0,
    tasksDue: data?.tasks_due ?? 0,
    isLoading,
    error,
    mutate,
  };
}
