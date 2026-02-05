"use client";

import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  const Icon = getCategoryIcon(habit.category);
  const categoryColorClass = getCategoryColor(habit.category);
  const categoryLabel = habit.category
    ? t(`categories.${habit.category}`)
    : t("categories.other");
  const freqTrans = getFrequencyTranslation(habit.frequency);
  const frequencyLabel = t(freqTrans.key, freqTrans.params);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isToggling) {
      onToggle(habit.id);
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={habit.name}
      className="cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onClick(habit.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(habit.id);
        }
      }}
    >
      <CardContent className="p-0 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("inline-flex items-center justify-center rounded-md p-1.5", categoryColorClass)}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="font-medium truncate">{habit.name}</h3>
              <p className="text-xs text-muted-foreground">
                {categoryLabel} · {frequencyLabel}
              </p>
            </div>
          </div>
          <div onClick={handleCheckboxClick}>
            <Checkbox
              checked={habit.completed_today}
              disabled={isToggling}
              aria-label={`${t("card.markComplete")} ${habit.name}`}
              className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
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
      </CardContent>
    </Card>
  );
}
