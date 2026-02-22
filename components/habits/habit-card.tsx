"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Flame, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getFrequencyTranslation } from "@/lib/habits/format";
import { getProjectColor } from "@/lib/projects/colors";
import type { HabitWithTodayStatus, Category } from "@/lib/db/types";

interface HabitCardProps {
  habit: HabitWithTodayStatus;
  categories?: Category[];
  onToggle: (habitId: string, date?: string) => Promise<void>;
  onClick: (habitId: string) => void;
  isToggling?: boolean;
}

export function HabitCard({ habit, categories, onToggle, onClick, isToggling }: HabitCardProps) {
  const t = useTranslations("habits");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const category = habit.category_id && categories
    ? categories.find((c) => c.id === habit.category_id) ?? null
    : null;
  const categoryColor = category
    ? getProjectColor(category.color)
    : null;
  const bgColor = categoryColor
    ? (isDark ? categoryColor.hslDark : categoryColor.hsl)
    : undefined;

  const freqTrans = getFrequencyTranslation(habit.frequency);
  const frequencyLabel = t(freqTrans.key, freqTrans.params);

  const handleCheckedChange = () => {
    if (!isToggling) {
      onToggle(habit.id).catch((err) => {
        console.error("Failed to toggle habit:", err);
      });
    }
  };

  return (
    <Card data-testid={`habit-card-${habit.id}`} className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none motion-reduce:hover:transform-none p-5">
      <CardContent className="p-0 space-y-3">
        <div className="flex items-start justify-between">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            onClick={() => onClick(habit.id)}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-md p-1.5",
                !bgColor && "bg-muted"
              )}
              style={bgColor ? { backgroundColor: bgColor } : undefined}
            >
              <Tag className="size-4 text-white" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-medium truncate">{habit.name}</h3>
              <p className="text-xs text-muted-foreground">
                {category?.name ?? ""}{category?.name ? " · " : ""}{frequencyLabel}
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
              {habit.current_streak >= 7 && <Flame className="size-4 text-status-streak" aria-hidden="true" />}
              <span className="font-semibold text-sm">
                {t(
                  habit.frequency.type === 'times_per_week' || habit.frequency.type === 'weekly'
                    ? "card.streakWeeks"
                    : "card.streakDays",
                  { count: habit.current_streak }
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("card.currentStreak")}</p>
          </div>
          <div className="flex-1 rounded-lg border p-2 text-center">
            <span className="font-semibold text-sm">
              {t(
                habit.frequency.type === 'times_per_week' || habit.frequency.type === 'weekly'
                  ? "card.streakWeeks"
                  : "card.streakDays",
                { count: habit.best_streak }
              )}
            </span>
            <p className="text-xs text-muted-foreground">{t("card.bestStreak")}</p>
          </div>
        </div>

        {/* Monthly progress bar */}
        <div className="space-y-1" data-testid="habit-monthly-progress">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("card.thisMonth", { percent: habit.monthly_completion_rate })}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
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
