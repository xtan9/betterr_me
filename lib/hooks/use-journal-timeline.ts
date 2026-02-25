"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { JournalEntry } from "@/lib/db/types";

export function useJournalTimeline(cursor?: string | null) {
  const key = cursor
    ? `/api/journal?mode=timeline&cursor=${cursor}`
    : "/api/journal?mode=timeline";

  const { data, error, isLoading, mutate } = useSWR<{
    entries: JournalEntry[];
    hasMore: boolean;
  }>(key, fetcher, { keepPreviousData: true });

  return {
    entries: data?.entries ?? [],
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}
