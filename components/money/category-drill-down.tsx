"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionRow } from "@/components/money/transaction-row";
import { useTransactions } from "@/lib/hooks/use-transactions";
import { useCategories } from "@/lib/hooks/use-categories";
import { formatMoney } from "@/lib/money/arithmetic";
import type { BudgetCategoryWithSpending } from "@/lib/db/types";

interface CategoryDrillDownProps {
  category: BudgetCategoryWithSpending;
  month: string; // YYYY-MM
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryDrillDown({
  category,
  month,
  open,
  onOpenChange,
}: CategoryDrillDownProps) {
  const t = useTranslations("money.budgets");
  const tTx = useTranslations("money.transactions");
  const { categories } = useCategories();

  // Compute date range for the month
  const dateFrom = `${month}-01`;
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { transactions, isLoading } = useTransactions({
    category_id: category.category_id,
    date_from: dateFrom,
    date_to: dateTo,
  });

  // Find the full category object for the TransactionRow
  const categoryObj = categories.find((c) => c.id === category.category_id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {category.category_icon && (
              <span>{category.category_icon}</span>
            )}
            <span>
              {t("categoryDrillDown", { category: category.category_name })}
            </span>
          </SheetTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatMoney(category.spent_cents)} {t("spent")}
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-1">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tTx("noTransactions")}
            </p>
          ) : (
            transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                category={categoryObj}
              />
            ))
          )}
        </div>

        <div className="mt-4">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link
              href={`/money/transactions?category_id=${category.category_id}&date_from=${dateFrom}&date_to=${dateTo}`}
            >
              {t("viewTransactions")}
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
