"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money/arithmetic";
import type { RecurringBill } from "@/lib/db/types";

interface BillCalendarDayProps {
  date: Date;
  bills: RecurringBill[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

export function BillCalendarDay({
  date,
  bills,
  isCurrentMonth,
  isToday,
  isExpanded,
  onToggle,
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
          isExpanded && "bg-accent"
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
