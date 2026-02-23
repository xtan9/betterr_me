"use client";

import { useTranslations } from "next-intl";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MotivationMessageProps {
  stats: {
    total_habits: number;
    completed_today: number;
    current_best_streak: number;
    tasks_due_today: number;
    tasks_completed_today: number;
  };
  topStreakHabit?: {
    name: string;
    current_streak: number;
    completed_today?: boolean;
  } | null;
  isFirstDay?: boolean;
  onDismiss?: () => void;
}

export function MotivationMessage({
  stats,
  topStreakHabit,
  isFirstDay = false,
  onDismiss,
}: MotivationMessageProps) {
  const t = useTranslations("dashboard.motivation");

  const getMessage = (): string => {
    // Priority 1: First day user
    if (isFirstDay) {
      return t("firstDay");
    }

    const totalHabits = stats.total_habits;
    const completed = stats.completed_today;

    // Priority 2: All habits complete (100%)
    if (totalHabits > 0 && completed === totalHabits) {
      return t("allComplete");
    }

    // Priority 3: High streak at risk (>= 7 days, not completed today)
    if (
      topStreakHabit &&
      topStreakHabit.current_streak >= 7 &&
      topStreakHabit.completed_today === false
    ) {
      return t("streakAtRisk", {
        habitName: topStreakHabit.name,
        count: topStreakHabit.current_streak,
      });
    }

    // Priority 4: Almost done (>=75% complete)
    if (totalHabits > 0) {
      const completionRate = completed / totalHabits;
      const remaining = totalHabits - completed;

      if (completionRate >= 0.75) {
        return t("almostDone", { remaining });
      }

      // Priority 5: Halfway there (50-75% complete)
      if (completionRate >= 0.5) {
        return t("halfway");
      }

      // Priority 6: Getting started (<50% complete)
      if (completionRate > 0) {
        return t("gettingStarted");
      }
    }

    // Priority 7: No habits yet
    return t("noHabits");
  };

  const message = getMessage();

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20">
      <Lightbulb className="size-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/90">{message}</p>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          aria-label={t("dismiss")}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
