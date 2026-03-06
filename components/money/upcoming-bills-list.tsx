"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money/arithmetic";

interface UpcomingBill {
  merchant_name: string;
  amount_cents: number;
  due_date: string;
}

interface UpcomingBillsListProps {
  bills: UpcomingBill[];
}

const MAX_VISIBLE_BILLS = 7;

/**
 * Upcoming bills preview for the money dashboard.
 * Shows the next 7 soonest bills sorted by due date.
 * Returns null when there are no bills.
 */
export function UpcomingBillsList({ bills }: UpcomingBillsListProps) {
  const t = useTranslations("money.dashboard");

  if (bills.length === 0) return null;

  // Sort by due date ascending (soonest first)
  const sorted = [...bills].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  const visible = sorted.slice(0, MAX_VISIBLE_BILLS);
  const hasMore = sorted.length > MAX_VISIBLE_BILLS;

  return (
    <Card className="border-money-border bg-money-surface">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            {t("upcomingBillsTitle")} ({bills.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.map((bill, index) => (
          <div
            key={`${bill.merchant_name}-${bill.due_date}-${index}`}
            className="flex items-start justify-between"
          >
            <div>
              <p className="text-sm font-medium">{bill.merchant_name}</p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(bill.due_date), "MMM d")}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums">
              {formatMoney(Math.abs(bill.amount_cents))}
            </p>
          </div>
        ))}

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground"
            asChild
          >
            <Link href="/money/bills">
              {t("viewAllBills")}
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
