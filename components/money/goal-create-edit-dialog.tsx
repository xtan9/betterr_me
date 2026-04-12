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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { centsToDecimal } from "@/lib/money/arithmetic";
import type { GoalWithProjection } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const goalFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    target_amount: z.string().min(1, "Required").refine(
      (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
      "Must be positive"
    ),
    deadline: z.string().optional(),
    funding_type: z.enum(["manual", "linked"]),
    linked_account_id: z.string().optional(),
    icon: z.string().max(10).optional(),
  })
  .refine(
    (data) => {
      if (data.funding_type === "linked" && !data.linked_account_id) {
        return false;
      }
      return true;
    },
    {
      message: "Please select an account",
      path: ["linked_account_id"],
    }
  );

type GoalFormValues = z.infer<typeof goalFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GoalCreateEditDialogProps {
  mode: "create" | "edit";
  goal?: GoalWithProjection | null;
  accounts: Array<{ id: string; name: string; mask: string | null }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalCreateEditDialog({
  mode,
  goal,
  accounts,
  open,
  onOpenChange,
  onSuccess,
}: GoalCreateEditDialogProps) {
  const t = useTranslations("money.goals");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: GoalFormValues =
    mode === "edit" && goal
      ? {
          name: goal.name,
          target_amount: centsToDecimal(goal.target_cents),
          deadline: goal.deadline || "",
          funding_type: goal.funding_type,
          linked_account_id: goal.linked_account_id || "",
          icon: goal.icon || "",
        }
      : {
          name: "",
          target_amount: "",
          deadline: "",
          funding_type: "manual",
          linked_account_id: "",
          icon: "",
        };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues,
  });

  const fundingType = watch("funding_type");

  const onSubmit = async (data: GoalFormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        name: data.name,
        target_amount: parseFloat(data.target_amount),
        deadline: data.deadline || undefined,
        funding_type: data.funding_type,
        linked_account_id:
          data.funding_type === "linked"
            ? data.linked_account_id
            : undefined,
        icon: data.icon || undefined,
      };

      const url =
        mode === "edit" && goal
          ? `/api/money/goals/${goal.id}`
          : "/api/money/goals";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to save goal");
      }

      toast.success(mode === "edit" ? t("goalUpdated") : t("goalCreated"));
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("editGoal") : t("createGoal")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="goal-name">{t("name")}</Label>
            <Input
              id="goal-name"
              placeholder={t("namePlaceholder")}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <Label htmlFor="goal-icon">{t("icon")}</Label>
            <Input
              id="goal-icon"
              placeholder={t("iconPlaceholder")}
              maxLength={10}
              className="w-20"
              {...register("icon")}
            />
          </div>

          {/* Target amount */}
          <div className="space-y-2">
            <Label htmlFor="goal-target">{t("targetAmount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="goal-target"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 tabular-nums"
                {...register("target_amount")}
              />
            </div>
            {errors.target_amount && (
              <p className="text-sm text-destructive">
                {errors.target_amount.message}
              </p>
            )}
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="goal-deadline">{t("deadline")}</Label>
            <Input id="goal-deadline" type="date" {...register("deadline")} />
          </div>

          {/* Funding type */}
          <div className="space-y-2">
            <Label>{t("fundingType")}</Label>
            <RadioGroup
              value={fundingType}
              onValueChange={(val) =>
                setValue("funding_type", val as "manual" | "linked")
              }
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="funding-manual" />
                <Label htmlFor="funding-manual" className="cursor-pointer font-normal">
                  {t("manualContributions")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="linked" id="funding-linked" />
                <Label htmlFor="funding-linked" className="cursor-pointer font-normal">
                  {t("linkToAccount")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Linked account selector */}
          {fundingType === "linked" && (
            <div className="space-y-2">
              <Label>{t("linkedAccount")}</Label>
              <Select
                value={watch("linked_account_id") || ""}
                onValueChange={(val) => setValue("linked_account_id", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                      {acc.mask && ` (${acc.mask})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.linked_account_id && (
                <p className="text-sm text-destructive">
                  {errors.linked_account_id.message}
                </p>
              )}
            </div>
          )}

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
              {isSubmitting
                ? t("saving")
                : mode === "edit"
                  ? t("saveChanges")
                  : t("createGoal")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
