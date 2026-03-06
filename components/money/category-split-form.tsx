"use client";

import { useTranslations } from "next-intl";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toCents, formatMoney, centsToDecimal } from "@/lib/money/arithmetic";
import type { Transaction, TransactionSplit, MoneyCategory as Category } from "@/lib/db/types";

interface CategorySplitFormProps {
  transaction: Transaction;
  existingSplits: TransactionSplit[];
  categories: Category[];
  onSave: () => void;
  onCancel: () => void;
}

interface SplitRow {
  category_id: string;
  amount: string; // Dollar amount as string for input control
}

interface SplitFormValues {
  splits: SplitRow[];
}

export function CategorySplitForm({
  transaction,
  existingSplits,
  categories,
  onSave,
  onCancel,
}: CategorySplitFormProps) {
  const t = useTranslations("money");
  const totalAbsCents = Math.abs(transaction.amount_cents);

  // Initialize from existing splits or create 2 empty rows
  const defaultSplits: SplitRow[] =
    existingSplits.length >= 2
      ? existingSplits.map((s) => ({
          category_id: s.category_id,
          amount: centsToDecimal(Math.abs(s.amount_cents)),
        }))
      : [
          { category_id: "", amount: "" },
          { category_id: "", amount: "" },
        ];

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<SplitFormValues>({
    defaultValues: { splits: defaultSplits },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "splits",
  });

  const watchedSplits = watch("splits");

  // Calculate running totals
  const enteredCents = watchedSplits.reduce((sum, row) => {
    const val = parseFloat(row.amount);
    if (isNaN(val) || val <= 0) return sum;
    return sum + toCents(val);
  }, 0);

  const remainingCents = totalAbsCents - enteredCents;

  // Auto-fill last split when only 2 splits exist
  const autoFillLast = () => {
    if (watchedSplits.length === 2 && remainingCents > 0) {
      const otherAmount = parseFloat(watchedSplits[0].amount);
      if (!isNaN(otherAmount) && otherAmount > 0) {
        setValue("splits.1.amount", centsToDecimal(remainingCents));
      }
    }
  };

  const onSubmit = async (data: SplitFormValues) => {
    // Convert to cents and validate
    const splits = data.splits
      .filter((s) => s.category_id && parseFloat(s.amount) > 0)
      .map((s) => ({
        category_id: s.category_id,
        amount_cents: toCents(parseFloat(s.amount)),
      }));

    if (splits.length < 2) return;

    const splitTotal = splits.reduce((sum, s) => sum + s.amount_cents, 0);
    if (splitTotal !== totalAbsCents) return;

    try {
      const res = await fetch(
        `/api/money/transactions/${transaction.id}/splits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ splits }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to save splits");
      }

      onSave();
    } catch {
      // Error handled by caller
    }
  };

  const isValid =
    watchedSplits.filter((s) => s.category_id && parseFloat(s.amount) > 0)
      .length >= 2 && remainingCents === 0;

  return (
    <div className="space-y-3 rounded-lg border border-money-border bg-money-surface/50 p-3">
      {/* Header with original amount */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {t("transactions.splitTransaction")}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(totalAbsCents)}
        </span>
      </div>

      {/* Split rows */}
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <Select
              value={watchedSplits[index]?.category_id ?? ""}
              onValueChange={(val) =>
                setValue(`splits.${index}.category_id`, val)
              }
            >
              <SelectTrigger className="w-full min-w-[120px]" size="sm">
                <SelectValue
                  placeholder={t("transactions.filters.category")}
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-1.5">
                      {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                      {cat.display_name || cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className="w-24 tabular-nums"
              value={watchedSplits[index]?.amount ?? ""}
              onChange={(e) => {
                setValue(`splits.${index}.amount`, e.target.value);
              }}
              onBlur={() => {
                if (index === 0 && watchedSplits.length === 2) {
                  autoFillLast();
                }
              }}
            />

            {fields.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Remaining amount indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {t("transactions.remaining")}
        </span>
        <span
          className={
            remainingCents === 0
              ? "font-medium text-green-600 dark:text-green-400"
              : remainingCents < 0
                ? "font-medium text-red-600 dark:text-red-400"
                : "font-medium tabular-nums"
          }
        >
          {formatMoney(Math.abs(remainingCents))}
          {remainingCents < 0 && " over"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => append({ category_id: "", amount: "" })}
        >
          <Plus className="mr-1 size-3.5" />
          {t("transactions.addSplit")}
        </Button>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("transactions.cancelSplits")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!isValid || isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {t("transactions.saveSplits")}
          </Button>
        </div>
      </div>

      {/* Validation message */}
      {remainingCents !== 0 && enteredCents > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("transactions.splitsMustEqual")}
        </p>
      )}
    </div>
  );
}
