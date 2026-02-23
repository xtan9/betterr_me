"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Transaction, Category } from "@/lib/db/types";

interface CategoryOverrideProps {
  transaction: Transaction;
  categories: Category[];
  onUpdate: () => void;
}

export function CategoryOverride({
  transaction,
  categories,
  onUpdate,
}: CategoryOverrideProps) {
  const t = useTranslations("money");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCategoryChange = async (newCategoryId: string) => {
    if (newCategoryId === (transaction.category_id ?? "")) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/money/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: newCategoryId }),
      });

      if (!res.ok) {
        throw new Error("Failed to update category");
      }

      onUpdate();

      // If the transaction has a merchant name, prompt for merchant rule
      if (transaction.merchant_name) {
        const category = categories.find((c) => c.id === newCategoryId);
        const categoryDisplayName =
          category?.display_name || category?.name || "";

        toast(
          t("transactions.merchantRulePrompt", {
            merchant: transaction.merchant_name,
            category: categoryDisplayName,
          }),
          {
            action: {
              label: t("transactions.merchantRuleConfirm"),
              onClick: async () => {
                try {
                  const ruleRes = await fetch("/api/money/merchant-rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      merchant_name: transaction.merchant_name,
                      category_id: newCategoryId,
                    }),
                  });

                  if (!ruleRes.ok) {
                    throw new Error("Failed to create rule");
                  }
                } catch {
                  toast.error("Failed to create merchant rule");
                }
              },
            },
            cancel: {
              label: t("transactions.merchantRuleSkip"),
              onClick: () => {
                // Do nothing - just dismiss
              },
            },
            duration: 10000,
          }
        );
      }
    } catch {
      toast.error("Failed to update category");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {t("transactions.filters.category")}
      </label>
      <Select
        value={transaction.category_id ?? ""}
        onValueChange={handleCategoryChange}
        disabled={isUpdating}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder={t("transactions.uncategorized")} />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              <span className="flex items-center gap-1.5">
                {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                {cat.color && (
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden="true"
                  />
                )}
                {cat.display_name || cat.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
