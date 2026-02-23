"use client";

import { useTranslations } from "next-intl";
import { format, isSameMonth } from "date-fns";
import { Check, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money/arithmetic";
import type { RecurringBill, BillUserStatus } from "@/lib/db/types";

interface BillRowProps {
  bill: RecurringBill;
  onStatusChange: (id: string, status: BillUserStatus) => void;
  onEdit: (bill: RecurringBill) => void;
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  SEMI_MONTHLY: "semiMonthly",
  MONTHLY: "monthly",
  ANNUALLY: "annually",
};

export function BillRow({ bill, onStatusChange, onEdit }: BillRowProps) {
  const t = useTranslations("money.bills");

  const frequencyKey = FREQUENCY_LABELS[bill.frequency] ?? "monthly";

  // Paid-this-month: if bill.is_active and updated_at is within current month
  // This is a heuristic; a more precise check would require transaction matching
  const isPaidThisMonth =
    bill.is_active &&
    bill.updated_at &&
    isSameMonth(new Date(bill.updated_at), new Date());

  // Price change detection
  const hasPriceChange =
    bill.previous_amount_cents !== null &&
    bill.previous_amount_cents !== bill.amount_cents;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-money-border bg-money-surface p-3 transition-colors hover:bg-accent/50">
      {/* Bill info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button
            className="truncate text-sm font-medium text-left hover:underline"
            onClick={() => onEdit(bill)}
          >
            {bill.name}
          </button>
          {isPaidThisMonth && (
            <Badge
              variant="outline"
              className="shrink-0 border-[hsl(var(--money-sage))]/30 bg-[hsl(var(--money-sage))]/10 text-[hsl(var(--money-sage))] text-xs"
            >
              <Check className="mr-0.5 size-3" />
              {t("paid")}
            </Badge>
          )}
          {hasPriceChange && bill.previous_amount_cents !== null && (
            <Badge
              variant="outline"
              className="shrink-0 border-[hsl(var(--money-amber))]/30 bg-[hsl(var(--money-amber))]/10 text-[hsl(var(--money-amber))] text-xs"
            >
              <AlertTriangle className="mr-0.5 size-3" />
              {t("priceChange", {
                old: formatMoney(bill.previous_amount_cents),
              })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t(frequencyKey)}</span>
          {bill.next_due_date && (
            <>
              <span className="text-muted-foreground/50">-</span>
              <span>
                {t("nextDue", {
                  date: format(new Date(bill.next_due_date + "T12:00:00"), "MMM d"),
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {formatMoney(bill.amount_cents)}
      </p>

      {/* Status actions */}
      <div className="flex shrink-0 items-center gap-1">
        {bill.user_status === "auto" && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-[hsl(var(--money-sage))]/30 text-[hsl(var(--money-sage))] text-xs hover:bg-[hsl(var(--money-sage))]/10"
              onClick={() => onStatusChange(bill.id, "confirmed")}
            >
              {t("confirm")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onStatusChange(bill.id, "dismissed")}
            >
              {t("dismiss")}
            </Button>
          </>
        )}
        {bill.user_status === "confirmed" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onStatusChange(bill.id, "dismissed")}
          >
            {t("dismiss")}
          </Button>
        )}
        {bill.user_status === "dismissed" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onStatusChange(bill.id, "confirmed")}
          >
            {t("reconfirm")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onEdit(bill)}
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
