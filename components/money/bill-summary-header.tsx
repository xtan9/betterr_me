"use client";

import { useTranslations } from "next-intl";
import { Receipt } from "lucide-react";
import { formatMoney } from "@/lib/money/arithmetic";

interface BillSummaryHeaderProps {
  totalMonthlyCents: number;
  billCount: number;
  pendingCount: number;
}

export function BillSummaryHeader({
  totalMonthlyCents,
  billCount,
  pendingCount,
}: BillSummaryHeaderProps) {
  const t = useTranslations("money.bills");

  return (
    <div className="flex items-center gap-4 rounded-lg border border-money-border bg-money-surface p-4">
      <div className="flex size-10 items-center justify-center rounded-full bg-[hsl(var(--money-sage))]/10">
        <Receipt className="size-5 text-[hsl(var(--money-sage))]" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">
          {t("summary", {
            count: billCount,
            pending: pendingCount,
            amount: formatMoney(totalMonthlyCents),
          })}
        </p>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(totalMonthlyCents)}
          <span className="text-sm font-normal text-muted-foreground">
            /mo
          </span>
        </p>
      </div>
    </div>
  );
}
