"use client";

import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";

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
}

export function MotivationMessage({
  stats,
  topStreakHabit,
  isFirstDay = false,
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
    <div className="rounded-lg bg-primary/5 dark:bg-primary/10 p-4 flex items-start gap-3">
      <Lightbulb className="size-5 text-primary shrink-0 mt-0.5" />
      <p className="text-sm text-foreground/90">{message}</p>
    </div>
  );
}
