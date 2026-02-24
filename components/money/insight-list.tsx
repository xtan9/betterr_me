"use client";

import { cn } from "@/lib/utils";
import { InsightCard } from "@/components/money/insight-card";
import { useInsights } from "@/lib/hooks/use-insights";
import type { InsightPage } from "@/lib/db/types";

interface InsightListProps {
  page: InsightPage;
  className?: string;
}

const MAX_INSIGHTS = 5;

/**
 * Renders a list of contextual insight cards for a specific page.
 * Returns null when there are no insights or data is loading.
 * Max 5 insights displayed (API already limits, enforced client-side too).
 */
export function InsightList({ page, className }: InsightListProps) {
  const { insights, isLoading, dismiss } = useInsights(page);

  // Don't render empty container or loading skeleton — be invisible until ready
  if (isLoading || insights.length === 0) {
    return null;
  }

  const visibleInsights = insights.slice(0, MAX_INSIGHTS);

  return (
    <div className={cn("space-y-2", className)}>
      {visibleInsights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} onDismiss={dismiss} />
      ))}
    </div>
  );
}
