"use client";

import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { createElement } from "react";
import { getFrequencyTranslation, getCategoryColor, getCategoryIcon } from "@/lib/habits/format";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitCardProps {
  habit: HabitWithTodayStatus;
  onToggle: (habitId: string, date?: string) => Promise<void>;
  onClick: (habitId: string) => void;
  isToggling?: boolean;
}

export function HabitCard({ habit, onToggle, onClick, isToggling }: HabitCardProps) {
  const t = useTranslations("habits");
  const categoryColorClass = getCategoryColor(habit.category);
  const categoryLabel = habit.category
    ? t(`categories.${habit.category}`)
    : t("categories.other");
  const freqTrans = getFrequencyTranslation(habit.frequency);
  const frequencyLabel = t(freqTrans.key, freqTrans.params);

  const handleCheckedChange = () => {
    if (!isToggling) {
      onToggle(habit.id);
    }
  };

  return (
    <Card data-testid={`habit-card-${habit.id}`} className="transition-all hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200 p-5">
      <CardContent className="p-0 space-y-3">
        <div className="flex items-start justify-between">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            onClick={() => onClick(habit.id)}
          >
            <span className={cn("inline-flex items-center justify-center rounded-md p-1.5", categoryColorClass)}>
              {createElement(getCategoryIcon(habit.category), { className: "size-4", "aria-hidden": "true" })}
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-medium truncate">{habit.name}</h3>
              <p className="text-xs text-muted-foreground">
                {categoryLabel} · {frequencyLabel}
              </p>
            </div>
          </button>
          <Checkbox
            checked={habit.completed_today}
            onCheckedChange={handleCheckedChange}
            disabled={isToggling}
            aria-label={`${t("card.markComplete")} ${habit.name}`}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>

        <div className="flex gap-3" data-testid="habit-streaks">
          <div className="flex-1 rounded-lg border p-2 text-center">
            <div className="flex items-center justify-center gap-1">
              {habit.current_streak >= 7 && <Flame className="size-4 text-orange-500" aria-hidden="true" />}
              <span className="font-semibold text-sm">
                {t("card.streakDays", { count: habit.current_streak })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("card.currentStreak")}</p>
          </div>
          <div className="flex-1 rounded-lg border p-2 text-center">
            <span className="font-semibold text-sm">
              {t("card.streakDays", { count: habit.best_streak })}
            </span>
            <p className="text-xs text-muted-foreground">{t("card.bestStreak")}</p>
          </div>
        </div>

        {/* Monthly progress bar */}
        <div className="space-y-1" data-testid="habit-monthly-progress">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("card.thisMonth", { percent: habit.monthly_completion_rate })}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${habit.monthly_completion_rate}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
