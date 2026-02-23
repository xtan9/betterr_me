"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money/arithmetic";
import type { BudgetWithCategories } from "@/lib/db/types";

interface RolloverPromptProps {
  previousBudget: BudgetWithCategories;
  currentMonth: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function RolloverPrompt({
  previousBudget,
  currentMonth,
  onConfirm,
  onDismiss,
}: RolloverPromptProps) {
  const t = useTranslations("money.budgets");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if last sync was > 24 hours ago
  const lastSynced = previousBudget.updated_at
    ? new Date(previousBudget.updated_at)
    : null;
  const isStaleData =
    lastSynced &&
    Date.now() - lastSynced.getTime() > 24 * 60 * 60 * 1000;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      // Find the current month's budget to get its ID for the rollover endpoint
      const res = await fetch(
        `/api/money/budgets?month=${currentMonth}`
      );
      if (!res.ok) throw new Error("Failed to fetch current budget");
      const { budget: currentBudget } = await res.json();
      if (!currentBudget) throw new Error("No budget found for current month");

      const rolloverRes = await fetch(
        `/api/money/budgets/${currentBudget.id}/rollover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from_budget_id: previousBudget.id }),
        }
      );

      if (!rolloverRes.ok) {
        const err = await rolloverRes.json();
        throw new Error(err.error || "Failed to confirm rollover");
      }

      toast.success(t("rolloverConfirmed"));
      onConfirm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to confirm rollover"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rolloverPromptTitle")}</DialogTitle>
          <DialogDescription>
            {t("rolloverPromptDescription")}
          </DialogDescription>
        </DialogHeader>

        {isStaleData && (
          <div className="rounded-lg border border-money-amber bg-[hsl(var(--money-amber-light))] px-3 py-2 text-sm text-[hsl(var(--money-amber-foreground))]">
            {t("syncWarning")}
          </div>
        )}

        <div className="space-y-2">
          {previousBudget.categories.map((cat) => {
            const rolloverAmount =
              cat.allocated_cents + cat.rollover_cents - cat.spent_cents;
            const isOverspent = rolloverAmount < 0;

            return (
              <div
                key={cat.category_id}
                className="flex items-center justify-between rounded-lg border border-money-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {cat.category_icon && (
                    <span className="text-sm">{cat.category_icon}</span>
                  )}
                  <span className="text-sm font-medium">
                    {cat.category_name}
                  </span>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium tabular-nums">
                    {isOverspent ? (
                      <span className="text-[hsl(var(--money-caution))]">
                        {formatMoney(rolloverAmount)}
                      </span>
                    ) : (
                      <span className="text-[hsl(var(--money-sage))]">
                        +{formatMoney(rolloverAmount)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatMoney(cat.allocated_cents)}{" "}
                    {isOverspent ? "overspent" : "remaining"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={isSubmitting}
          >
            {t("skipRollover")}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "..." : t("confirmRollover")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
