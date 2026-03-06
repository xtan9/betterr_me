"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { GoalContribution, GoalWithProjection, ViewMode } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// useGoals
// ---------------------------------------------------------------------------

/**
 * SWR hook for fetching all savings goals with projection data.
 * Uses keepPreviousData to prevent skeleton flash on refetch.
 *
 * @param view - Optional view mode for household filtering. Defaults to "mine".
 */
export function useGoals(view: ViewMode = "mine") {
  const { data, error, mutate } = useSWR<{
    goals: GoalWithProjection[];
  }>(`/api/money/goals?view=${view}`, fetcher, {
    keepPreviousData: true,
  });

  const isLoading = !data && !error;

  return {
    goals: data?.goals ?? [],
    isLoading,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// useGoal
// ---------------------------------------------------------------------------

/**
 * SWR hook for fetching a single goal with projection data and contributions.
 * Conditional fetch: only runs when id is non-null.
 */
export function useGoal(id: string | null) {
  const { data: goalData, error: goalError, mutate: goalMutate } = useSWR<{
    goal: GoalWithProjection;
  }>(id ? `/api/money/goals/${id}` : null, fetcher, {
    keepPreviousData: true,
  });

  const { data: contribData, error: contribError, mutate: contribMutate } = useSWR<{
    contributions: GoalContribution[];
  }>(id ? `/api/money/goals/${id}/contributions` : null, fetcher, {
    keepPreviousData: true,
  });

  const isLoading = (!goalData && !goalError) || (!contribData && !contribError);

  return {
    goal: goalData?.goal ?? null,
    contributions: contribData?.contributions ?? [],
    isLoading,
    error: goalError || contribError,
    mutate: async () => {
      await Promise.all([goalMutate(), contribMutate()]);
    },
  };
}
