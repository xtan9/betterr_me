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
      onToggle(habit.id).catch((err) => {
        console.error("Failed to toggle habit:", err);
      });
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-accent motion-reduce:transition-none">
      <Checkbox
        checked={habit.completed_today}
        onCheckedChange={handleCheckboxChange}
        disabled={isToggling}
        aria-label={`${t("card.markComplete")} ${habit.name}`}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
      <button
        type="button"
        className="flex-1 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        onClick={() => onClick(habit.id)}
      >
        <span className={cn("font-medium truncate block", habit.completed_today && "text-muted-foreground")}>{habit.name}</span>
      </button>
      <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", categoryColorClass)}>
        {categoryLabel}
      </span>
      <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
        {habit.current_streak >= 7 && <Flame className="size-3.5 text-status-streak" aria-hidden="true" />}
        <span>
          {t(
            habit.frequency.type === 'times_per_week' || habit.frequency.type === 'weekly'
              ? "card.streakWeeks"
              : "card.streakDays",
            { count: habit.current_streak }
          )}
        </span>
      </div>
    </div>
  );
}
