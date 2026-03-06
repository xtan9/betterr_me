"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money/arithmetic";

interface DashboardHeroProps {
  availableCents: number;
  upcomingBillsTotalCents: number;
  endOfMonthBalanceCents: number;
  confidenceLabel: string;
  hasConfirmedIncome: boolean;
}

/**
 * Three-number summary row for the money dashboard hero section.
 * Shows available money, upcoming bills total, and projected end-of-month balance
 * with equal weight (no single dominant metric).
 */
export function DashboardHero({
  availableCents,
  upcomingBillsTotalCents,
  endOfMonthBalanceCents,
  confidenceLabel,
  hasConfirmedIncome,
}: DashboardHeroProps) {
  const t = useTranslations("money.dashboard");

  const availableColor =
    availableCents >= 0
      ? "text-money-sage-foreground"
      : "text-[hsl(var(--money-caution))]";

  const projectedColor =
    endOfMonthBalanceCents >= 0
      ? "text-money-sage-foreground"
      : "text-[hsl(var(--money-caution))]";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* Available money */}
      <div className="rounded-xl border border-money-border bg-money-surface p-5">
        <p className="text-sm text-muted-foreground">
          {hasConfirmedIncome
            ? t("availableUntilPaycheck")
            : t("availableUntilEndOfMonth")}
        </p>
        <p className={`text-2xl font-bold tabular-nums ${availableColor}`}>
          {formatMoney(availableCents)}
        </p>
      </div>

      {/* Upcoming bills */}
      <div className="rounded-xl border border-money-border bg-money-surface p-5">
        <p className="text-sm text-muted-foreground">
          {t("upcomingBills30Days")}
        </p>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(upcomingBillsTotalCents)}
        </p>
      </div>

      {/* Projected end-of-month balance */}
      <div className="rounded-xl border border-money-border bg-money-surface p-5">
        <p className="text-sm text-muted-foreground">
          {t("endOfMonthBalance")}
        </p>
        <p className={`text-2xl font-bold tabular-nums ${projectedColor}`}>
          {formatMoney(endOfMonthBalanceCents)}
        </p>
        <p className="mt-1 text-xs italic text-muted-foreground">
          {confidenceLabel === "based on confirmed income"
            ? t("confidenceConfirmed")
            : t("confidenceEstimated")}
        </p>
      </div>
    </div>
  );
}
