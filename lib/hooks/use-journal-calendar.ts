"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { JournalCalendarDay } from "@/lib/db/types";

export function useJournalCalendar(
  year: number | null,
  month: number | null
) {
  const key =
    year != null && month != null
      ? `/api/journal/calendar?year=${year}&month=${month}`
      : null;

  const { data, error, isLoading, mutate } = useSWR<{
    entries: JournalCalendarDay[];
  }>(key, fetcher, { keepPreviousData: true });

  return {
    entries: data?.entries ?? [],
    error,
    isLoading,
    mutate,
  };
}
