"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Clock, Heart, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HabitWithAbsence } from "@/lib/db/types";

type AbsenceVariant = "recovery" | "lapse" | "hiatus";

function getVariant(missed: number): AbsenceVariant {
  if (missed <= 2) return "recovery";
  if (missed <= 6) return "lapse";
  return "hiatus";
}

const variantConfig = {
  recovery: {
    icon: AlertCircle,
    border: "border-l-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    iconColor: "text-amber-500",
    titleColor: "text-amber-700 dark:text-amber-400",
  },
  lapse: {
    icon: Clock,
    border: "border-l-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-500",
    titleColor: "text-blue-700 dark:text-blue-400",
  },
  hiatus: {
    icon: Heart,
    border: "border-l-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    iconColor: "text-orange-500",
    titleColor: "text-orange-700 dark:text-orange-400",
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

  const variant = getVariant(habit.missed_scheduled_days);
  const config = variantConfig[variant];
  const Icon = config.icon;

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
          {t(`${variant}Title`, { name: habit.name, days: habit.missed_scheduled_days })}
        </p>

        {variant === "lapse" && habit.previous_streak > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("previousStreak", { days: habit.previous_streak })}
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
