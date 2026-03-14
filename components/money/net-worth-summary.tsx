"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetWorth } from "@/lib/hooks/use-net-worth";
import { formatMoney } from "@/lib/money/arithmetic";
import type { ViewMode } from "@/lib/db/types";

interface NetWorthSummaryProps {
  view?: ViewMode;
}

export function NetWorthSummary({ view = "mine" }: NetWorthSummaryProps) {
  const t = useTranslations("money.netWorth");
  const { netWorth, isLoading } = useNetWorth(view);

  if (isLoading) {
    return (
      <Card className="border-money-border bg-money-surface">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-8">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!netWorth) return null;

  const changePositive =
    netWorth.change && netWorth.change.amount_cents >= 0;
  const changePercent =
    netWorth.change ? Math.abs(netWorth.change.percent).toFixed(1) : null;

  return (
    <Card className="border-money-border bg-money-surface">
      <CardContent className="p-6">
        {/* Total net worth */}
        <div className="mb-1">
          <p className="text-sm text-muted-foreground">
            {t("totalNetWorth")}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(netWorth.net_worth_cents)}
          </p>
        </div>

        {/* Change indicator */}
        {netWorth.change && (
          <div className="flex items-center gap-1 mb-4">
            {changePositive ? (
              <ArrowUpRight className="size-4 text-[hsl(var(--money-sage))]" />
            ) : (
              <ArrowDownRight className="size-4 text-[hsl(var(--money-caution))]" />
            )}
            <span
              className={`text-sm font-medium tabular-nums ${
                changePositive
                  ? "text-[hsl(var(--money-sage))]"
                  : "text-[hsl(var(--money-caution))]"
              }`}
            >
              {changePositive ? "+" : "-"}
              {formatMoney(Math.abs(netWorth.change.amount_cents))}
              {changePercent && ` (${changePositive ? "+" : "-"}${changePercent}%)`}
            </span>
          </div>
        )}

        {/* Assets and Liabilities side by side */}
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-muted-foreground">{t("assets")}</p>
            <p className="text-lg font-medium tabular-nums text-[hsl(var(--money-sage))]">
              {formatMoney(netWorth.assets_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("liabilities")}</p>
            <p className="text-lg font-medium tabular-nums text-muted-foreground">
              {formatMoney(netWorth.liabilities_cents)}
            </p>
          </div>
        </div>

        {/* Manual assets note */}
        {netWorth.manual_assets_cents > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {t("includesManual", {
              amount: formatMoney(netWorth.manual_assets_cents),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
