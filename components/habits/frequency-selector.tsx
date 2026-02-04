"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";
import type { HabitFrequency } from "@/lib/db/types";

interface FrequencySelectorProps {
  value: HabitFrequency;
  onChange: (frequency: HabitFrequency) => void;
  disabled?: boolean;
}

type FrequencyOptionKey = "daily" | "weekdays" | "weekly" | "timesPerWeek2" | "timesPerWeek3" | "custom";

type FrequencyOption = {
  key: FrequencyOptionKey;
  toFrequency: () => HabitFrequency;
  match: (freq: HabitFrequency) => boolean;
};

const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  {
    key: "daily",
    toFrequency: () => ({ type: "daily" }),
    match: (f) => f.type === "daily",
  },
  {
    key: "weekdays",
    toFrequency: () => ({ type: "weekdays" }),
    match: (f) => f.type === "weekdays",
  },
  {
    key: "weekly",
    toFrequency: () => ({ type: "weekly" }),
    match: (f) => f.type === "weekly",
  },
  {
    key: "timesPerWeek2",
    toFrequency: () => ({ type: "times_per_week", count: 2 }),
    match: (f) => f.type === "times_per_week" && f.count === 2,
  },
  {
    key: "timesPerWeek3",
    toFrequency: () => ({ type: "times_per_week", count: 3 }),
    match: (f) => f.type === "times_per_week" && f.count === 3,
  },
  {
    key: "custom",
    toFrequency: () => ({ type: "custom", days: [1] }),
    match: (f) => f.type === "custom",
  },
];

const OPTION_LABEL_MAP: Record<FrequencyOptionKey, { i18nKey: string; params?: Record<string, number> }> = {
  daily: { i18nKey: "daily" },
  weekdays: { i18nKey: "weekdays" },
  weekly: { i18nKey: "weekly" },
  timesPerWeek2: { i18nKey: "timesPerWeek", params: { count: 2 } },
  timesPerWeek3: { i18nKey: "timesPerWeek", params: { count: 3 } },
  custom: { i18nKey: "custom" },
};

export function FrequencySelector({
  value,
  onChange,
  disabled = false,
}: FrequencySelectorProps) {
  const t = useTranslations("habits.frequency");

  const handleFrequencySelect = (option: FrequencyOption) => {
    if (disabled) return;
    if (option.match(value)) return;
    onChange(option.toFrequency());
  };

  const handleDayToggle = (dayIndex: number) => {
    if (disabled || value.type !== "custom") return;

    const currentDays = value.days;
    const isSelected = currentDays.includes(dayIndex);

    if (isSelected) {
      // Don't allow deselecting the last day
      if (currentDays.length <= 1) return;
      onChange({
        type: "custom",
        days: currentDays.filter((d) => d !== dayIndex),
      });
    } else {
      onChange({
        type: "custom",
        days: [...currentDays, dayIndex].sort((a, b) => a - b),
      });
    }
  };

  const selectedDayNames =
    value.type === "custom"
      ? value.days.map((d) => t(`days.${DAY_KEYS[d]}`)).join(", ")
      : "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {FREQUENCY_OPTIONS.map((option) => {
          const isActive = option.match(value);
          const labelConfig = OPTION_LABEL_MAP[option.key];
          const label = labelConfig.params
            ? t(labelConfig.i18nKey, labelConfig.params)
            : t(labelConfig.i18nKey);

          return (
            <Toggle
              key={option.key}
              variant="outline"
              pressed={isActive}
              onPressedChange={() => handleFrequencySelect(option)}
              disabled={disabled}
              className={cn(
                "h-10 text-sm",
                isActive && "bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white data-[state=on]:bg-emerald-500 data-[state=on]:text-white"
              )}
            >
              {label}
            </Toggle>
          );
        })}
      </div>

      {value.type === "custom" && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {DAY_INDICES.map((dayIndex) => {
              const isSelected = value.days.includes(dayIndex);
              const dayLabel = t(`days.${DAY_KEYS[dayIndex]}`);

              return (
                <Toggle
                  key={dayIndex}
                  variant="outline"
                  size="sm"
                  pressed={isSelected}
                  onPressedChange={() => handleDayToggle(dayIndex)}
                  disabled={disabled}
                  aria-label={dayLabel}
                  className={cn(
                    "flex-1 text-xs",
                    isSelected && "bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white data-[state=on]:bg-emerald-500 data-[state=on]:text-white"
                  )}
                >
                  {dayLabel}
                </Toggle>
              );
            })}
          </div>
          {selectedDayNames && (
            <p className="text-sm text-muted-foreground">
              {t("selectedDays", { days: selectedDayNames })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
