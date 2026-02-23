"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/lib/hooks/use-categories";
import { formatMoney, toCents, centsToDecimal } from "@/lib/money/arithmetic";
import type { BudgetWithCategories, Category } from "@/lib/db/types";

interface BudgetFormProps {
  mode: "create" | "edit";
  budget?: BudgetWithCategories;
  month: string; // YYYY-MM
  onSuccess: () => void;
  onCancel: () => void;
}

const formSchema = z
  .object({
    total: z
      .string()
      .min(1, "Required")
      .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be positive"),
    rollover_enabled: z.boolean(),
    categories: z
      .array(
        z.object({
          category_id: z.string().min(1, "Select a category"),
          amount: z.string().min(1, "Required"),
        })
      )
      .min(1, "At least one category required"),
  })
  .refine(
    (data) => {
      const total = parseFloat(data.total) || 0;
      const sum = data.categories.reduce(
        (acc, c) => acc + (parseFloat(c.amount) || 0),
        0
      );
      return sum <= total;
    },
    {
      message: "Category allocations cannot exceed total budget",
      path: ["categories"],
    }
  );

type FormValues = z.infer<typeof formSchema>;

export function BudgetForm({
  mode,
  budget,
  month,
  onSuccess,
  onCancel,
}: BudgetFormProps) {
  const t = useTranslations("money.budgets");
  const { categories: allCategories } = useCategories();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: FormValues =
    mode === "edit" && budget
      ? {
          total: centsToDecimal(budget.total_cents),
          rollover_enabled: budget.rollover_enabled,
          categories: budget.categories.map((c) => ({
            category_id: c.category_id,
            amount: centsToDecimal(c.allocated_cents),
          })),
        }
      : {
          total: "",
          rollover_enabled: false,
          categories: [{ category_id: "", amount: "" }],
        };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "categories",
  });

  const watchTotal = watch("total");
  const watchCategories = watch("categories");

  const totalAmount = parseFloat(watchTotal) || 0;
  const allocatedAmount = watchCategories.reduce(
    (acc, c) => acc + (parseFloat(c.amount) || 0),
    0
  );
  const unallocatedAmount = totalAmount - allocatedAmount;

  // Filter out already-selected categories
  const selectedIds = new Set(watchCategories.map((c) => c.category_id));
  const availableCategories = (catId: string) =>
    allCategories.filter((c) => c.id === catId || !selectedIds.has(c.id));

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        month: `${month}-01`,
        total: parseFloat(data.total),
        rollover_enabled: data.rollover_enabled,
        categories: data.categories.map((c) => ({
          category_id: c.category_id,
          amount: parseFloat(c.amount),
        })),
      };

      const url =
        mode === "edit" && budget
          ? `/api/money/budgets/${budget.id}`
          : "/api/money/budgets";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save budget");
      }

      toast.success(mode === "edit" ? t("updated") : t("created"));
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save budget");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryDisplay = (cat: Category) => {
    const icon = cat.icon ? `${cat.icon} ` : "";
    return `${icon}${cat.display_name || cat.name}`;
  };

  return (
    <Card className="border-money-border bg-money-surface">
      <CardHeader>
        <CardTitle>
          {mode === "edit" ? t("editBudget") : t("createBudget")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Total amount */}
          <div className="space-y-2">
            <Label htmlFor="total" className="text-base font-semibold">
              {t("totalBudget")}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 text-2xl font-bold tabular-nums"
                {...register("total")}
              />
            </div>
            {errors.total && (
              <p className="text-sm text-destructive">
                {errors.total.message}
              </p>
            )}
          </div>

          {/* Category allocations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                {t("allocated")}
              </Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatMoney(toCents(allocatedAmount))} /{" "}
                {formatMoney(toCents(totalAmount))}
              </span>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Select
                  value={watchCategories[index]?.category_id || ""}
                  onValueChange={(val) =>
                    setValue(`categories.${index}.category_id`, val)
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories(
                      watchCategories[index]?.category_id || ""
                    ).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {getCategoryDisplay(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-5 tabular-nums"
                    {...register(`categories.${index}.amount`)}
                  />
                </div>

                {/* Percentage of total */}
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {totalAmount > 0
                    ? `${Math.round(
                        ((parseFloat(watchCategories[index]?.amount) || 0) /
                          totalAmount) *
                          100
                      )}%`
                    : "0%"}
                </span>

                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {errors.categories && (
              <p className="text-sm text-destructive">
                {typeof errors.categories === "object" && "message" in errors.categories
                  ? (errors.categories as { message?: string }).message
                  : ""}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => append({ category_id: "", amount: "" })}
            >
              <Plus className="mr-1 size-3.5" />
              {t("addCategory")}
            </Button>

            {/* Unallocated amount */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span>{t("unallocated")}</span>
              <span
                className={`font-medium tabular-nums ${
                  unallocatedAmount < 0 ? "text-destructive" : ""
                }`}
              >
                {formatMoney(toCents(unallocatedAmount))}
              </span>
            </div>
          </div>

          {/* Rollover toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-money-border p-3">
            <Checkbox
              id="rollover"
              checked={watch("rollover_enabled")}
              onCheckedChange={(checked) =>
                setValue("rollover_enabled", checked === true)
              }
            />
            <div className="space-y-1">
              <Label htmlFor="rollover" className="cursor-pointer font-medium">
                {t("rolloverEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("rolloverDescription")}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "edit"
                  ? t("editBudget")
                  : t("createBudget")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
