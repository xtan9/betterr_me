"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RecurrenceRule, EndType } from "@/lib/db/types";

type PresetKey =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom";

interface RecurrencePickerProps {
  value: RecurrenceRule | null;
  endType: EndType;
  endDate: string | null;
  endCount: number | null;
  onChange: (
    rule: RecurrenceRule | null,
    endType: EndType,
    endDate: string | null,
    endCount: number | null
  ) => void;
  disabled?: boolean;
  startDate?: string | null;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function ruleToPreset(rule: RecurrenceRule | null): PresetKey {
  if (!rule) return "none";
  if (rule.frequency === "daily" && rule.interval === 1) return "daily";
  if (
    rule.frequency === "weekly" &&
    rule.interval === 1 &&
    rule.days_of_week &&
    rule.days_of_week.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => rule.days_of_week!.includes(d))
  ) {
    return "weekdays";
  }
  if (
    rule.frequency === "weekly" &&
    rule.interval === 1 &&
    rule.days_of_week &&
    rule.days_of_week.length > 0
  ) {
    return "weekly";
  }
  if (
    rule.frequency === "weekly" &&
    rule.interval === 2
  ) {
    return "biweekly";
  }
  if (rule.frequency === "monthly" && rule.interval === 1) return "monthly";
  if (rule.frequency === "yearly" && rule.interval === 1) return "yearly";
  return "custom";
}

function presetToRule(
  preset: PresetKey,
  startDate: string | null
): RecurrenceRule | null {
  const getStartDow = () => {
    if (!startDate) return new Date().getDay();
    const [y, m, d] = startDate.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  };

  switch (preset) {
    case "none":
      return null;
    case "daily":
      return { frequency: "daily", interval: 1 };
    case "weekdays":
      return { frequency: "weekly", interval: 1, days_of_week: [1, 2, 3, 4, 5] };
    case "weekly":
      return { frequency: "weekly", interval: 1, days_of_week: [getStartDow()] };
    case "biweekly":
      return { frequency: "weekly", interval: 2, days_of_week: [getStartDow()] };
    case "monthly": {
      const day = startDate ? parseInt(startDate.split("-")[2]) : new Date().getDate();
      return { frequency: "monthly", interval: 1, day_of_month: day };
    }
    case "yearly": {
      const month = startDate ? parseInt(startDate.split("-")[1]) : new Date().getMonth() + 1;
      const day = startDate ? parseInt(startDate.split("-")[2]) : new Date().getDate();
      return { frequency: "yearly", interval: 1, month_of_year: month, day_of_month: day };
    }
    case "custom":
      return { frequency: "daily", interval: 1 };
  }
}

export function RecurrencePicker({
  value,
  endType,
  endDate,
  endCount,
  onChange,
  disabled = false,
  startDate,
}: RecurrencePickerProps) {
  const t = useTranslations("tasks.recurrence");
  const [preset, setPreset] = useState<PresetKey>(() => ruleToPreset(value));

  const handlePresetChange = useCallback(
    (newPreset: string) => {
      const key = newPreset as PresetKey;
      setPreset(key);
      const rule = presetToRule(key, startDate ?? null);
      onChange(rule, endType, endDate, endCount);
    },
    [startDate, endType, endDate, endCount, onChange]
  );

  const handleDaysToggle = useCallback(
    (days: string[]) => {
      if (!value || days.length === 0) return;
      const numDays = days.map(Number).sort();
      const updated: RecurrenceRule = { ...value, days_of_week: numDays };
      onChange(updated, endType, endDate, endCount);
    },
    [value, endType, endDate, endCount, onChange]
  );

  const handleCustomFrequencyChange = useCallback(
    (freq: string) => {
      if (!value) return;
      const updated: RecurrenceRule = {
        ...value,
        frequency: freq as RecurrenceRule["frequency"],
        // Reset sub-fields when switching frequency
        days_of_week: freq === "weekly" ? [0] : undefined,
        day_of_month: freq === "monthly" ? 1 : undefined,
        week_position: undefined,
        day_of_week_monthly: undefined,
        month_of_year: freq === "yearly" ? 1 : undefined,
      };
      onChange(updated, endType, endDate, endCount);
    },
    [value, endType, endDate, endCount, onChange]
  );

  const handleIntervalChange = useCallback(
    (intervalStr: string) => {
      if (!value) return;
      const interval = Math.max(1, parseInt(intervalStr) || 1);
      onChange({ ...value, interval }, endType, endDate, endCount);
    },
    [value, endType, endDate, endCount, onChange]
  );

  const handleEndTypeChange = useCallback(
    (newEndType: string) => {
      onChange(value, newEndType as EndType, endDate, endCount);
    },
    [value, endDate, endCount, onChange]
  );

  const showDayPicker =
    value?.frequency === "weekly" && (preset === "weekly" || preset === "biweekly" || preset === "custom");
  const showCustomControls = preset === "custom" && value;
  const showEndControls = value !== null;

  return (
    <div className="space-y-3">
      {/* Preset selector */}
      <Select
        value={preset}
        onValueChange={handlePresetChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("none")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("none")}</SelectItem>
          <SelectItem value="daily">{t("daily")}</SelectItem>
          <SelectItem value="weekdays">{t("weekdays")}</SelectItem>
          <SelectItem value="weekly">{t("weekly")}</SelectItem>
          <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
          <SelectItem value="monthly">{t("monthly")}</SelectItem>
          <SelectItem value="yearly">{t("yearly")}</SelectItem>
          <SelectItem value="custom">{t("custom")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom frequency & interval */}
      {showCustomControls && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {t("every")}
          </span>
          <Input
            type="number"
            min={1}
            max={365}
            value={value.interval}
            onChange={(e) => handleIntervalChange(e.target.value)}
            className="w-20"
            disabled={disabled}
          />
          <Select
            value={value.frequency}
            onValueChange={handleCustomFrequencyChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t("days")}</SelectItem>
              <SelectItem value="weekly">{t("weeks")}</SelectItem>
              <SelectItem value="monthly">{t("months")}</SelectItem>
              <SelectItem value="yearly">{t("years")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Day of week picker */}
      {showDayPicker && value.days_of_week && (
        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">
            {t("onDays")}
          </Label>
          <ToggleGroup
            type="multiple"
            value={value.days_of_week.map(String)}
            onValueChange={handleDaysToggle}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {DAY_KEYS.map((key, i) => (
              <ToggleGroupItem
                key={i}
                value={String(i)}
                disabled={disabled}
                className={cn(
                  "min-w-[2.5rem]",
                  value.days_of_week!.includes(i) &&
                    "bg-primary text-primary-foreground"
                )}
              >
                {t(`dayShort.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {/* End condition */}
      {showEndControls && (
        <div className="space-y-2 pt-1">
          <Label className="text-sm text-muted-foreground">
            {t("ends")}
          </Label>
          <RadioGroup
            value={endType}
            onValueChange={handleEndTypeChange}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="never" id="end-never" />
              <Label htmlFor="end-never" className="text-sm font-normal">
                {t("endNever")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="after_count" id="end-count" />
              <Label htmlFor="end-count" className="text-sm font-normal">
                {t("endAfter")}
              </Label>
              {endType === "after_count" && (
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={endCount ?? 10}
                  onChange={(e) =>
                    onChange(
                      value,
                      endType,
                      endDate,
                      Math.max(1, parseInt(e.target.value) || 1)
                    )
                  }
                  className="w-20 h-8"
                  disabled={disabled}
                />
              )}
              {endType === "after_count" && (
                <span className="text-sm text-muted-foreground">
                  {t("endTimes")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="on_date" id="end-date" />
              <Label htmlFor="end-date" className="text-sm font-normal">
                {t("endOn")}
              </Label>
              {endType === "on_date" && (
                <Input
                  type="date"
                  value={endDate ?? ""}
                  onChange={(e) =>
                    onChange(value, endType, e.target.value || null, endCount)
                  }
                  className="w-44 h-8"
                  disabled={disabled}
                />
              )}
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  );
}
