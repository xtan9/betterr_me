"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HabitRow } from "@/components/habits/habit-row";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitChecklistProps {
  habits: HabitWithTodayStatus[];
  onToggle: (habitId: string) => Promise<void>;
  onCreateHabit: () => void;
  togglingHabitIds?: Set<string>;
}

export function HabitChecklist({
  habits,
  onToggle,
  onCreateHabit,
  togglingHabitIds,
}: HabitChecklistProps) {
  const t = useTranslations("dashboard.habits");
  const router = useRouter();

  const completedCount = habits.filter((h) => h.completed_today).length;
  const totalCount = habits.length;
  const remaining = totalCount - completedCount;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  const handleHabitClick = (habitId: string) => {
    router.push(`/habits/${habitId}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
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
                  isToggling={togglingHabitIds?.has(habit.id)}
                />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              {allComplete ? (
                <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/30 p-6 text-center">
                  <div className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-3 mb-3">
                    <PartyPopper className="size-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-display text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    {t("perfectDay")}
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                    {t("allCompletedDesc", { count: totalCount })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  {t("completed", {
                    completed: completedCount,
                    total: totalCount,
                  })}
                  {" • "}
                  {t("moreToGo", { count: remaining })}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
