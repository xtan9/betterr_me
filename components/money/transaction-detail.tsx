"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CategoryOverride } from "@/components/money/category-override";
import { CategorySplitForm } from "@/components/money/category-split-form";
import { CategoryBadge } from "@/components/money/category-badge";
import { formatMoney } from "@/lib/money/arithmetic";
import type { Transaction, MoneyCategory as Category, TransactionSplit } from "@/lib/db/types";

interface TransactionDetailProps {
  transaction: Transaction;
  categories: Category[];
  onUpdate: () => void;
  onClose: () => void;
}

export function TransactionDetail({
  transaction,
  categories,
  onUpdate,
  onClose,
}: TransactionDetailProps) {
  const t = useTranslations("money");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [isLoadingSplits, setIsLoadingSplits] = useState(true);

  // Load splits on mount
  useEffect(() => {
    const fetchSplits = async () => {
      try {
        const res = await fetch(
          `/api/money/transactions/${transaction.id}/splits`
        );
        if (res.ok) {
          const data = await res.json();
          setSplits(data.splits ?? []);
        }
      } catch {
        // Non-critical - just show no splits
      } finally {
        setIsLoadingSplits(false);
      }
    };
    fetchSplits();
  }, [transaction.id]);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/money/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        throw new Error("Failed to save notes");
      }

      onUpdate();
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSplitSaved = () => {
    setShowSplitForm(false);
    // Reload splits
    fetch(`/api/money/transactions/${transaction.id}/splits`)
      .then((res) => res.json())
      .then((data) => setSplits(data.splits ?? []))
      .catch(() => {});
    onUpdate();
  };

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="overflow-hidden transition-all duration-200">
      <div className="rounded-b-lg border border-t-0 border-money-border bg-money-surface px-4 py-3">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Left column: Category + Notes */}
          <div className="space-y-3">
            <CategoryOverride
              transaction={transaction}
              categories={categories}
              onUpdate={onUpdate}
            />

            {/* Notes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("transactions.notes")}
              </label>
              <div className="flex flex-col gap-1.5">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("transactions.notes")}
                  className="min-h-[60px] resize-none text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-end"
                  disabled={
                    isSavingNotes || notes === (transaction.notes ?? "")
                  }
                  onClick={handleSaveNotes}
                >
                  {t("transactions.saveNotes")}
                </Button>
              </div>
            </div>
          </div>

          {/* Right column: Account info + Plaid category */}
          <div className="space-y-3">
            {/* Account */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("transactions.account")}
              </label>
              <p className="text-sm">{transaction.account_id}</p>
            </div>

            {/* Source */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("transactions.source")}
              </label>
              <Badge variant="outline" className="capitalize">
                {transaction.source}
              </Badge>
            </div>

            {/* Plaid category info */}
            {transaction.source === "plaid" &&
              transaction.plaid_category_primary && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("transactions.plaidCategory")}
                  </label>
                  <p className="text-sm capitalize">
                    {transaction.plaid_category_primary}
                    {transaction.plaid_category_detailed &&
                      ` / ${transaction.plaid_category_detailed}`}
                  </p>
                </div>
              )}
          </div>
        </div>

        {/* Split section */}
        <div className="mt-3 border-t border-money-border pt-3">
          {showSplitForm ? (
            <CategorySplitForm
              transaction={transaction}
              existingSplits={splits}
              categories={categories}
              onSave={handleSplitSaved}
              onCancel={() => setShowSplitForm(false)}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {!isLoadingSplits && splits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {splits.map((split) => {
                      const cat = categoryMap.get(split.category_id);
                      return (
                        <span
                          key={split.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs"
                        >
                          <CategoryBadge category={cat ?? null} />
                          <span className="tabular-nums">
                            {formatMoney(Math.abs(split.amount_cents))}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSplitForm(true)}
              >
                <Scissors className="mr-1 size-3.5" />
                {t("transactions.splitTransaction")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
