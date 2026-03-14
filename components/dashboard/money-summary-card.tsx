"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useMoneySummary } from "@/lib/hooks/use-money-summary";
import { formatMoney } from "@/lib/money/arithmetic";
import { cn } from "@/lib/utils";

/**
 * Spending pulse card for the main BetterR.Me dashboard.
 * Uses an independent SWR hook (useMoneySummary) so it never blocks
 * habits/tasks loading. Returns null silently when no money accounts exist.
 */
export function MoneySummaryCard() {
  const t = useTranslations("money.summary");
  const { summary, isLoading, hasAccounts } = useMoneySummary();

  // Silent: no card if loading, no accounts, or error
  if (isLoading || !hasAccounts || !summary) {
    return null;
  }

  // Budget progress: approximate weekly share as budget_total / 4.33
  const weeklyBudgetCents = summary.budget_total_cents
    ? Math.round(summary.budget_total_cents / 4.33)
    : null;

  const weeklyPercent =
    weeklyBudgetCents && weeklyBudgetCents > 0
      ? Math.min(
          Math.round((summary.spent_this_week_cents / weeklyBudgetCents) * 100),
          100
        )
      : null;

  // Progress bar color based on budget utilization
  const getProgressColor = (percent: number): string => {
    if (percent >= 90) return "bg-[hsl(var(--money-caution))]";
    if (percent >= 70) return "bg-[hsl(var(--money-amber))]";
    return "bg-[hsl(var(--money-sage))]";
  };

  return (
    <Link href="/money" className="block">
      <Card className="border-money-border bg-money-surface transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-3 p-4">
          {/* Icon */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--money-sage-light))]">
            <Wallet className="size-4 text-[hsl(var(--money-sage-foreground))]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("title")}
            </p>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="tabular-nums">
                {t("spentToday")}: {formatMoney(summary.spent_today_cents)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {t("thisWeek")}: {formatMoney(summary.spent_this_week_cents)}
              </span>
            </div>

            {/* Budget progress bar */}
            {weeklyPercent !== null && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getProgressColor(weeklyPercent)
                  )}
                  style={{ width: `${weeklyPercent}%` }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
