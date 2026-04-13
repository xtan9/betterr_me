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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const contributeFormSchema = z.object({
  amount: z.string().min(1, "Required").refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
    "Must be positive"
  ),
  note: z.string().max(200).optional(),
});

type ContributeFormValues = z.infer<typeof contributeFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContributeDialogProps {
  goalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContributeDialog({
  goalId,
  open,
  onOpenChange,
  onSuccess,
}: ContributeDialogProps) {
  const t = useTranslations("money.goals");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContributeFormValues>({
    resolver: zodResolver(contributeFormSchema),
    defaultValues: { amount: "", note: "" },
  });

  const onSubmit = async (data: ContributeFormValues) => {
    if (!goalId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/money/goals/${goalId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(data.amount),
          note: data.note || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to add contribution");
      }

      toast.success(t("contributionAdded"));
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add contribution"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addFunds")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="contribution-amount">{t("amount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="contribution-amount"
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

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="contribution-note">{t("note")}</Label>
            <Textarea
              id="contribution-note"
              placeholder={t("notePlaceholder")}
              rows={2}
              {...register("note")}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("addFunds")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
