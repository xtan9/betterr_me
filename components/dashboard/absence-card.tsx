"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Clock, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HabitWithAbsence } from "@/lib/db/types";

type AbsenceVariant = "recovery" | "lapse" | "hiatus";

function getVariant(missed: number, unit: 'days' | 'weeks'): AbsenceVariant {
  if (unit === 'weeks') {
    if (missed <= 1) return "recovery";
    if (missed <= 3) return "lapse";
    return "hiatus";
  }
  if (missed <= 2) return "recovery";
  if (missed <= 6) return "lapse";
  return "hiatus";
}

const variantConfig = {
  recovery: {
    icon: AlertCircle,
    border: "border-l-amber-500",
    bg: "bg-absence-warning-bg",
    iconColor: "text-absence-warning-icon",
    titleColor: "text-absence-warning-title",
  },
  lapse: {
    icon: Clock,
    border: "border-l-blue-500",
    bg: "bg-absence-info-bg",
    iconColor: "text-absence-info-icon",
    titleColor: "text-absence-info-title",
  },
  hiatus: {
    icon: Heart,
    border: "border-l-orange-500",
    bg: "bg-absence-caution-bg",
    iconColor: "text-absence-caution-icon",
    titleColor: "text-absence-caution-title",
  },
};

interface AbsenceCardProps {
  habit: HabitWithAbsence;
  onDismiss: (habitId: string) => void;
  onNavigate: (path: string) => void;
}

export function AbsenceCard({ habit, onDismiss, onNavigate }: AbsenceCardProps) {
  const t = useTranslations("dashboard.absence");

  const unit = habit.absence_unit ?? 'days';
  const variant = getVariant(habit.missed_scheduled_periods, unit);
  const config = variantConfig[variant];
  const Icon = config.icon;
  const titleSuffix = unit === 'weeks' ? 'Weeks' : '';

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border-l-4",
        config.border,
        config.bg,
      )}
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", config.titleColor)}>
          {t(`${variant}Title${titleSuffix}`, { name: habit.name, days: habit.missed_scheduled_periods })}
        </p>

        {variant === "lapse" && habit.previous_streak > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(unit === 'weeks' ? "previousStreakWeeks" : "previousStreak", { days: habit.previous_streak })}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => onNavigate(`/habits/${habit.id}`)}
          >
            {t("viewHabit")}
          </button>
          {variant === "hiatus" && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => onNavigate(`/habits/${habit.id}/edit`)}
              >
                {t("changeFrequency")}
              </button>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDismiss(habit.id)}
        className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        aria-label={t("dismiss")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
