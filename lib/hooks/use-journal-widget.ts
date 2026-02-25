"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";
import type { MoodRating, OnThisDayEntry } from "@/lib/db/types";

interface JournalTodayEntry {
  id: string;
  mood: MoodRating | null;
  title: string;
  content: Record<string, unknown>;
  word_count: number;
}

interface JournalTodayResponse {
  entry: JournalTodayEntry | null;
  streak: number;
  on_this_day: OnThisDayEntry[];
}

export function useJournalWidget() {
  const today = getLocalDateString();

  const { data, error, isLoading } = useSWR<JournalTodayResponse>(
    `/api/journal/today?date=${today}`,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: true },
  );

  return {
    entry: data?.entry ?? null,
    streak: data?.streak ?? 0,
    onThisDay: data?.on_this_day ?? [],
    error,
    isLoading,
  };
}
