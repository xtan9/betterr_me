"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centsToDecimal } from "@/lib/money/arithmetic";
import type { RecurringBill, BillFrequency } from "@/lib/db/types";

interface BillFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: RecurringBill | null;
  onSuccess: () => void;
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  amount: z
    .string()
    .min(1, "Required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be positive"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]),
  next_due_date: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FREQUENCIES: { value: BillFrequency; labelKey: string }[] = [
  { value: "WEEKLY", labelKey: "weekly" },
  { value: "BIWEEKLY", labelKey: "biweekly" },
  { value: "SEMI_MONTHLY", labelKey: "semiMonthly" },
  { value: "MONTHLY", labelKey: "monthly" },
  { value: "ANNUALLY", labelKey: "annually" },
];

export function BillForm({ open, onOpenChange, bill, onSuccess }: BillFormProps) {
  const t = useTranslations("money.bills");
  const isEdit = !!bill;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: FormValues = bill
    ? {
        name: bill.name,
        amount: centsToDecimal(bill.amount_cents),
        frequency: bill.frequency,
        next_due_date: bill.next_due_date ?? "",
      }
    : {
        name: "",
        amount: "",
        frequency: "MONTHLY",
        next_due_date: "",
      };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const watchFrequency = watch("frequency");

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        name: data.name,
        amount: parseFloat(data.amount),
        frequency: data.frequency,
        ...(data.next_due_date ? { next_due_date: data.next_due_date } : {}),
      };

      const url = isEdit
        ? `/api/money/bills/${bill.id}`
        : "/api/money/bills";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to save bill");
      }

      toast.success(isEdit ? t("updated") : t("created"));
      reset();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save bill");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editBill") : t("createBill")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="bill-name">{t("name")}</Label>
            <Input
              id="bill-name"
              placeholder="Netflix, Rent, etc."
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="bill-amount">{t("amount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="bill-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 tabular-nums"
                {...register("amount")}
              />
            </div>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>{t("frequency")}</Label>
            <Select
              value={watchFrequency}
              onValueChange={(val) =>
                setValue("frequency", val as BillFrequency)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {t(f.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next Due Date */}
          <div className="space-y-2">
            <Label htmlFor="bill-due-date">{t("nextDueDate")}</Label>
            <Input
              id="bill-due-date"
              type="date"
              {...register("next_due_date")}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
