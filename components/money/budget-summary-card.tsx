"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetRing } from "@/components/money/budget-ring";
import { formatMoney } from "@/lib/money/arithmetic";

interface BudgetSummaryCardProps {
  totalCents: number;
  totalSpentCents: number;
}

export function BudgetSummaryCard({
  totalCents,
  totalSpentCents,
}: BudgetSummaryCardProps) {
  const t = useTranslations("money.budgets");

  const overallPercent =
    totalCents > 0
      ? Math.round((totalSpentCents / totalCents) * 100)
      : 0;
  const remaining = totalCents - totalSpentCents;

  return (
    <Card className="border-money-border bg-money-surface">
      <CardContent className="flex items-center gap-6 p-card-padding">
        <BudgetRing percent={overallPercent} size={64} strokeWidth={5} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body text-muted-foreground">
                {t("totalBudget")}
              </p>
              <p className="text-stat tabular-nums">
                {formatMoney(totalCents)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-body text-muted-foreground">
                {remaining >= 0 ? t("remaining") : t("overBudget")}
              </p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  remaining < 0
                    ? "text-[hsl(var(--money-caution))]"
                    : "text-[hsl(var(--money-sage))]"
                }`}
              >
                {formatMoney(Math.abs(remaining))}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-body text-muted-foreground">
            <span className="tabular-nums">
              {formatMoney(totalSpentCents)} {t("spent")}
            </span>
            <span>({overallPercent}%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
