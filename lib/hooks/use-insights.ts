"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Insight, InsightPage } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * SWR hook for contextual insights.
 * Optionally filter by page (dashboard, budgets, bills, goals).
 * Provides a `dismiss` helper that POSTs to the insights endpoint
 * and revalidates the cache.
 *
 * @param page - Optional page filter for insights.
 */
export function useInsights(page?: InsightPage) {
  const key = page
    ? `/api/money/insights?page=${page}`
    : `/api/money/insights`;

  const { data, error, mutate } = useSWR<{ insights: Insight[] }>(
    key,
    fetcher
  );

  const isLoading = !data && !error;

  const dismiss = async (insightId: string) => {
    await fetch("/api/money/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insight_id: insightId }),
    });
    mutate(); // Revalidate to remove dismissed insight
  };

  return {
    insights: data?.insights ?? [],
    isLoading,
    dismiss,
  };
}
