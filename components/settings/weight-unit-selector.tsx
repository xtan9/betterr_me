"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { WeightUnitPreference } from "@/lib/preferences/types";
import { isWeightUnitPreference } from "@/lib/preferences/owners";

interface WeightUnitSelectorProps {
  value: WeightUnitPreference;
  onChange: (unit: WeightUnitPreference) => void;
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
        if (isWeightUnitPreference(val)) {
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
