"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { formatWeight } from "@/lib/fitness/units";
import type { WeightUnit } from "@/lib/db/types";

interface PRBannerProps {
  exerciseName: string;
  prType: "weight" | "volume" | "reps" | "duration";
  value: number;
  weightUnit?: WeightUnit;
  onDismiss?: () => void;
}

export function PRBanner({
  exerciseName,
  prType,
  value,
  weightUnit = "kg",
  onDismiss,
}: PRBannerProps) {
  const t = useTranslations("workouts");
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  const formattedValue = formatPRValue(prType, value, weightUnit);
  const prMessage = getPRMessage(t, prType, formattedValue);

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 motion-reduce:transition-none dark:border-amber-800 dark:bg-amber-950/30 animate-in fade-in slide-in-from-top-1 duration-300"
      role="status"
      aria-live="polite"
    >
      <Trophy className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t("newPR")}
        </p>
        <p className="truncate text-xs text-amber-700 dark:text-amber-300">
          {exerciseName} &mdash; {prMessage}
        </p>
      </div>
    </div>
  );
}

function formatPRValue(
  prType: "weight" | "volume" | "reps" | "duration",
  value: number,
  weightUnit: WeightUnit
): string {
  switch (prType) {
    case "weight":
    case "volume":
      return formatWeight(value, weightUnit);
    case "reps":
      return String(value);
    case "duration":
      return `${value}s`;
  }
}

function getPRMessage(
  t: (key: string, values?: Record<string, string | number>) => string,
  prType: "weight" | "volume" | "reps" | "duration",
  formattedValue: string
): string {
  switch (prType) {
    case "weight":
      return t("weightPR", { value: formattedValue });
    case "volume":
      return t("volumePR", { value: formattedValue });
    case "reps":
      return t("repsPR", { value: formattedValue });
    case "duration":
      return t("durationPR", { value: formattedValue });
  }
}
