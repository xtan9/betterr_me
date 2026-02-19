"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Clock, Heart, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  onToggle: (habitId: string) => Promise<void>;
  onNavigate: (path: string) => void;
}

export function AbsenceCard({ habit, onToggle, onNavigate }: AbsenceCardProps) {
  const t = useTranslations("dashboard.absence");
  const [isCompleting, setIsCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const unit = habit.absence_unit ?? 'days';
  const variant = getVariant(habit.missed_scheduled_days, unit);
  const config = variantConfig[variant];
  const Icon = config.icon;
  const titleSuffix = unit === 'weeks' ? 'Weeks' : '';

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onToggle(habit.id);
      setJustCompleted(true);
    } catch (err) {
      console.error("Failed to complete habit:", err);
    } finally {
      setIsCompleting(false);
    }
  };

  if (justCompleted) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border-l-4 border-l-primary bg-highlight">
        <Check className="size-5 text-primary shrink-0" />
        <p className="text-sm font-medium text-primary">
          {t("completed", { name: habit.name })}
        </p>
      </div>
    );
  }

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
          {t(`${variant}Title${titleSuffix}`, { name: habit.name, days: habit.missed_scheduled_days })}
        </p>

        {variant === "lapse" && habit.previous_streak > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(unit === 'weeks' ? "previousStreakWeeks" : "previousStreak", { days: habit.previous_streak })}
          </p>
        )}

        {/* Recovery / Lapse: inline checkbox */}
        {variant !== "hiatus" && (
          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              checked={false}
              onCheckedChange={handleComplete}
              disabled={isCompleting}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <span className="text-xs text-muted-foreground">
              {t("markComplete")}
            </span>
          </div>
        )}

        {/* Hiatus: CTAs */}
        {variant === "hiatus" && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleComplete}
              disabled={isCompleting}
            >
              {t("resume")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onNavigate(`/habits/${habit.id}/edit`)}
            >
              {t("changeFrequency")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
