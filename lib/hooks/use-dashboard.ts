import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { DashboardData } from "@/lib/db/types";

export function useDashboard(date?: string) {
  const params = date ? `?date=${date}` : "";
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    `/api/dashboard${params}`,
    fetcher
  );

  return {
    dashboard: data ?? null,
    error,
    isLoading,
    mutate,
  };
}
