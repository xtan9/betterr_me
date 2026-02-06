"use client";

import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { getCategoryColor } from "@/lib/habits/format";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitRowProps {
  habit: HabitWithTodayStatus;
  onToggle: (habitId: string, date?: string) => Promise<void>;
  onClick: (habitId: string) => void;
  isToggling?: boolean;
}

export function HabitRow({ habit, onToggle, onClick, isToggling }: HabitRowProps) {
  const t = useTranslations("habits");
  const categoryColorClass = getCategoryColor(habit.category);
  const categoryLabel = habit.category
    ? t(`categories.${habit.category}`)
    : t("categories.other");

  const handleCheckboxChange = () => {
    if (!isToggling) {
      onToggle(habit.id);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <Checkbox
        checked={habit.completed_today}
        onCheckedChange={handleCheckboxChange}
        disabled={isToggling}
        aria-label={`${t("card.markComplete")} ${habit.name}`}
        className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
      />
      <button
        type="button"
        className="flex-1 text-left min-w-0"
        onClick={() => onClick(habit.id)}
      >
        <span className="font-medium truncate block">{habit.name}</span>
      </button>
      <span className={cn("text-xs px-2 py-0.5 rounded-full", categoryColorClass)}>
        {categoryLabel}
      </span>
      <div className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
        {habit.current_streak >= 7 && <Flame className="size-3.5 text-orange-500" aria-hidden="true" />}
        <span>{t("card.streakDays", { count: habit.current_streak })}</span>
      </div>
    </div>
  );
}
