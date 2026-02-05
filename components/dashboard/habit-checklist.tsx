"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HabitRow } from "@/components/habits/habit-row";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitChecklistProps {
  habits: HabitWithTodayStatus[];
  onToggle: (habitId: string) => Promise<void>;
  onCreateHabit: () => void;
  isLoading?: boolean;
}

export function HabitChecklist({
  habits,
  onToggle,
  onCreateHabit,
  isLoading,
}: HabitChecklistProps) {
  const t = useTranslations("dashboard.habits");

  const completedCount = habits.filter((h) => h.completed_today).length;
  const totalCount = habits.length;
  const remaining = totalCount - completedCount;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  const handleHabitClick = (habitId: string) => {
    // Navigate to habit detail page - will be implemented later
    console.log("Navigate to habit:", habitId);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateHabit}
          className="gap-1"
        >
          <Plus className="size-4" />
          {t("addHabit")}
        </Button>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="font-medium mb-1">{t("noHabits")}</p>
            <p className="text-sm">{t("createFirst")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  onToggle={onToggle}
                  onClick={handleHabitClick}
                  isToggling={isLoading}
                />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t text-sm text-center text-muted-foreground">
              {allComplete ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {t("allComplete")} 🎉
                </span>
              ) : (
                <>
                  {t("completed", { completed: completedCount, total: totalCount })}
                  {" • "}
                  {t("moreToGo", { count: remaining })}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
