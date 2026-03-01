"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface WeightUnitSelectorProps {
  value: "kg" | "lbs";
  onChange: (unit: "kg" | "lbs") => void;
  disabled?: boolean;
}

export function WeightUnitSelector({
  value,
  onChange,
  disabled = false,
}: WeightUnitSelectorProps) {
  const t = useTranslations("settings.weightUnit");

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val === "kg" || val === "lbs") {
          onChange(val);
        }
      }}
      disabled={disabled}
      className="justify-start"
    >
      <ToggleGroupItem value="kg" aria-label={t("kg")} className="px-4">
        {t("kg")}
      </ToggleGroupItem>
      <ToggleGroupItem value="lbs" aria-label={t("lbs")} className="px-4">
        {t("lbs")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
