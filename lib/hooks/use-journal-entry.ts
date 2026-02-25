"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { JournalEntry } from "@/lib/db/types";

export function useJournalEntry(date: string | null) {
  const key = date ? `/api/journal?date=${date}` : null;

  const { data, error, isLoading, mutate } = useSWR<{
    entry: JournalEntry | null;
  }>(key, fetcher, { keepPreviousData: true });

  return {
    entry: data?.entry ?? null,
    error,
    isLoading,
    mutate,
  };
}
