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
  isLoading?: boolean;
}

export function HabitChecklist({
  habits,
  onToggle,
  onCreateHabit,
  isLoading,
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
                  isToggling={isLoading}
                />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              {allComplete ? (
                <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 dark:border-primary/30 p-6 text-center">
                  <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-3">
                    <PartyPopper className="size-6 text-primary" />
                  </div>
                  <p className="font-display text-section-heading font-bold text-foreground">
                    {t("perfectDay")}
                  </p>
                  <p className="text-sm text-primary mt-1">
                    {t("allCompletedDesc", { count: totalCount })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  {t("completed", { completed: completedCount, total: totalCount })}
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
