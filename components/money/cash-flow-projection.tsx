"use client";

import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import { AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money/arithmetic";
import { getDangerZoneStatus } from "@/lib/money/projections";
import type { DailyBalance } from "@/lib/db/types";

interface CashFlowProjectionProps {
  dailyBalances: DailyBalance[];
  dailySpendingRateCents: number;
}

/**
 * Cash flow projection section for the money dashboard.
 * Shows balance trend direction and warns about danger zone dates.
 * Keeps it simple per Calm Finance: key numbers with context, no chart.
 */
export function CashFlowProjection({
  dailyBalances,
  dailySpendingRateCents,
}: CashFlowProjectionProps) {
  const t = useTranslations("money.dashboard");

  if (dailyBalances.length === 0) return null;

  const firstBalance = dailyBalances[0];
  const lastBalance = dailyBalances[dailyBalances.length - 1];
  const changeCents =
    lastBalance.projected_balance_cents - firstBalance.projected_balance_cents;
  const isIncreasing = changeCents >= 0;
  const totalDays = dailyBalances.length;

  // Find danger zone dates (projected balance <= 0)
  const dangerDates = dailyBalances.filter((day) => {
    const status = getDangerZoneStatus(
      day.projected_balance_cents,
      dailySpendingRateCents
    );
    return status === "danger";
  });

  const firstDangerDate = dangerDates.length > 0 ? dangerDates[0] : null;

  return (
    <Card className="border-money-border bg-money-surface">
      <CardHeader>
        <CardTitle className="text-base">{t("cashFlowTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Balance trend */}
        <div className="flex items-start gap-2">
          {isIncreasing ? (
            <TrendingUp className="mt-0.5 size-4 text-money-sage" />
          ) : (
            <TrendingDown className="mt-0.5 size-4 text-[hsl(var(--money-caution))]" />
          )}
          <p className="text-sm">
            {isIncreasing
              ? t("balanceProjectedIncrease", {
                  amount: formatMoney(Math.abs(changeCents)),
                  days: totalDays,
                })
              : t("balanceProjectedDecrease", {
                  amount: formatMoney(Math.abs(changeCents)),
                  days: totalDays,
                })}
          </p>
        </div>

        {/* Danger zone warning */}
        {firstDangerDate && (
          <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--money-caution)/0.08)] px-3 py-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--money-caution))]" />
            <p className="text-sm text-[hsl(var(--money-caution))]">
              {t("dangerZoneWarning", {
                date: format(parseISO(firstDangerDate.date), "MMM d"),
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
