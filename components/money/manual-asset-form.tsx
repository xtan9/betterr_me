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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centsToDecimal } from "@/lib/money/arithmetic";
import type { ManualAsset } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const assetFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  value: z.string().min(1, "Required").refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
    "Must be positive"
  ),
  asset_type: z.enum(["property", "vehicle", "investment", "other"]),
  notes: z.string().max(500).optional(),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ManualAssetFormProps {
  asset?: ManualAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualAssetForm({
  asset,
  open,
  onOpenChange,
  onSuccess,
}: ManualAssetFormProps) {
  const t = useTranslations("money.netWorth");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!asset;

  const defaultValues: AssetFormValues = asset
    ? {
        name: asset.name,
        value: centsToDecimal(asset.value_cents),
        asset_type: asset.asset_type,
        notes: asset.notes || "",
      }
    : {
        name: "",
        value: "",
        asset_type: "property",
        notes: "",
      };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues,
  });

  const onSubmit = async (data: AssetFormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        name: data.name,
        value: parseFloat(data.value),
        asset_type: data.asset_type,
        notes: data.notes || undefined,
      };

      const url = isEdit
        ? `/api/money/manual-assets/${asset.id}`
        : "/api/money/manual-assets";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to save asset");
      }

      toast.success(isEdit ? t("assetUpdated") : t("assetCreated"));
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editAsset") : t("addAsset")}
          </DialogTitle>
        </DialogHeader>

        {/* Clarification text */}
        <p className="text-sm text-muted-foreground">
          {t("assetClarification")}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="asset-name">{t("assetName")}</Label>
            <Input
              id="asset-name"
              placeholder={t("assetNamePlaceholder")}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Value */}
          <div className="space-y-2">
            <Label htmlFor="asset-value">{t("assetValue")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="asset-value"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 tabular-nums"
                {...register("value")}
              />
            </div>
            {errors.value && (
              <p className="text-sm text-destructive">{errors.value.message}</p>
            )}
          </div>

          {/* Asset type */}
          <div className="space-y-2">
            <Label>{t("assetType")}</Label>
            <Select
              value={watch("asset_type")}
              onValueChange={(val) =>
                setValue(
                  "asset_type",
                  val as "property" | "vehicle" | "investment" | "other"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="property">{t("property")}</SelectItem>
                <SelectItem value="vehicle">{t("vehicle")}</SelectItem>
                <SelectItem value="investment">
                  {t("assetInvestment")}
                </SelectItem>
                <SelectItem value="other">{t("assetOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="asset-notes">{t("assetNotes")}</Label>
            <Textarea
              id="asset-notes"
              placeholder={t("assetNotesPlaceholder")}
              rows={2}
              {...register("notes")}
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
