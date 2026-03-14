"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money/arithmetic";
import type { RecurringBill } from "@/lib/db/types";

/**
 * Format cents into an abbreviated display string for compact calendar cells.
 * e.g., 210000 -> "$2.1k", 50000 -> "$500", -150000 -> "-$1.5k"
 */
function formatCompactMoney(cents: number): string {
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const dollars = absCents / 100;

  let formatted: string;
  if (dollars >= 1000) {
    const k = dollars / 1000;
    // Show one decimal if not a whole number
    formatted = k % 1 === 0 ? `$${k}k` : `$${k.toFixed(1)}k`;
  } else {
    formatted = `$${Math.round(dollars)}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

interface BillCalendarDayProps {
  date: Date;
  bills: RecurringBill[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  /** Danger zone status from projected balance. Optional for backward compat. */
  balanceStatus?: "safe" | "tight" | "danger";
  /** Projected balance in cents. Optional for backward compat. */
  projectedBalanceCents?: number;
}

export function BillCalendarDay({
  date,
  bills,
  isCurrentMonth,
  isToday,
  isExpanded,
  onToggle,
  balanceStatus,
  projectedBalanceCents,
}: BillCalendarDayProps) {
  const dayNumber = format(date, "d");
  const hasBills = bills.length > 0;

  return (
    <div className="min-h-[4rem]">
      <button
        className={cn(
          "flex w-full flex-col items-start rounded-md p-1 text-left text-sm transition-colors",
          !isCurrentMonth && "opacity-40",
          isCurrentMonth && "hover:bg-accent/50",
          isToday && "ring-1 ring-[hsl(var(--money-sage))]",
          isExpanded && "bg-accent",
          // Danger zone shading from projected balance
          balanceStatus === "tight" &&
            "bg-[hsl(var(--money-amber-light))] border-l-2 border-l-[hsl(var(--money-amber))]",
          balanceStatus === "danger" &&
            "bg-red-50 dark:bg-red-950/20 border-l-2 border-l-[hsl(var(--money-caution))]"
        )}
        onClick={onToggle}
        disabled={!hasBills}
        type="button"
      >
        <span
          className={cn(
            "mb-0.5 text-xs font-medium tabular-nums",
            isToday && "font-bold text-[hsl(var(--money-sage))]",
            !isCurrentMonth && "text-muted-foreground"
          )}
        >
          {dayNumber}
        </span>

        {/* Bill markers */}
        {bills.length > 0 && bills.length <= 2 && (
          <div className="w-full space-y-0.5">
            {bills.map((bill) => (
              <div
                key={bill.id}
                className="truncate text-[10px] leading-tight text-[hsl(var(--money-sage))]"
                title={`${bill.name} - ${formatMoney(bill.amount_cents)}`}
              >
                {bill.name}
              </div>
            ))}
          </div>
        )}

        {bills.length > 2 && (
          <div className="flex items-center gap-1">
            <div className="size-1.5 rounded-full bg-[hsl(var(--money-sage))]" />
            <span className="text-[10px] text-muted-foreground">
              {bills.length} bills
            </span>
          </div>
        )}

        {/* Projected balance — compact display at bottom of day cell */}
        {projectedBalanceCents !== undefined && (
          <span className="mt-auto text-[10px] text-muted-foreground tabular-nums">
            {formatCompactMoney(projectedBalanceCents)}
          </span>
        )}
      </button>

      {/* Inline expansion for bill details */}
      {isExpanded && hasBills && (
        <div className="mt-1 rounded-md border border-money-border bg-money-surface p-2 space-y-1">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="truncate font-medium">{bill.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMoney(bill.amount_cents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
