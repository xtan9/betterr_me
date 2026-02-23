"use client";

import type { Transaction, Category } from "@/lib/db/types";
import { formatMoney } from "@/lib/money/arithmetic";
import { CategoryBadge } from "@/components/money/category-badge";
import { cn } from "@/lib/utils";

interface TransactionRowProps {
  transaction: Transaction;
  category?: Category | null;
  onClick?: () => void;
  isExpanded?: boolean;
}

export function TransactionRow({
  transaction,
  category,
  onClick,
  isExpanded,
}: TransactionRowProps) {
  const isIncome = transaction.amount_cents > 0;
  const formattedAmount = formatMoney(Math.abs(transaction.amount_cents));
  const signedAmount = isIncome ? `+${formattedAmount}` : `-${formattedAmount}`;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-150 hover:bg-accent",
        isExpanded && "bg-accent"
      )}
      onClick={onClick}
    >
      {/* Left: Category badge + description */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {transaction.merchant_name || transaction.description}
        </p>
        <div className="mt-0.5">
          <CategoryBadge category={category ?? null} />
        </div>
      </div>

      {/* Right: Amount */}
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isIncome
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {signedAmount}
        </p>
        {transaction.is_pending && (
          <p className="text-xs text-muted-foreground">Pending</p>
        )}
      </div>
    </button>
  );
}
