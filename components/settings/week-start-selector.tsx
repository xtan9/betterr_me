"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface WeekStartSelectorProps {
  value: number; // 0 = Sunday, 1 = Monday
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function WeekStartSelector({
  value,
  onChange,
  disabled = false,
}: WeekStartSelectorProps) {
  const t = useTranslations("settings.weekStart");

  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      onValueChange={(val) => {
        if (val) {
          onChange(Number(val));
        }
      }}
      disabled={disabled}
      className="justify-start"
    >
      <ToggleGroupItem value="0" aria-label={t("sunday")} className="px-4">
        {t("sunday")}
      </ToggleGroupItem>
      <ToggleGroupItem value="1" aria-label={t("monday")} className="px-4">
        {t("monday")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
