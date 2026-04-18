"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardHeaderWithActions } from "@/components/shared/card-header-with-actions";
import { HabitRow } from "@/components/habits/habit-row";
import { useCategories } from "@/lib/hooks/use-categories";
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
  const { categories } = useCategories();

  const sortedHabits = [...habits].sort(
    (a, b) => Number(a.completed_today) - Number(b.completed_today),
  );

  const completedCount = habits.filter((h) => h.completed_today).length;
  const totalCount = habits.length;
  const remaining = totalCount - completedCount;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  const handleHabitClick = (habitId: string) => {
    router.push(`/habits/${habitId}`);
  };

  return (
    <Card className="flex flex-col">
      <CardHeaderWithActions
        title={t("title")}
        href="/habits"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateHabit}
            className="gap-1"
          >
            <Plus className="size-4" />
            {t("addHabit")}
          </Button>
        }
      />
      <CardContent className="flex-1 flex flex-col">
        {totalCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="font-medium mb-1">{t("noHabits")}</p>
            <p className="text-body">{t("createFirst")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {sortedHabits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  categories={categories}
                  onToggle={onToggle}
                  onClick={handleHabitClick}
                  isToggling={togglingHabitIds?.has(habit.id)}
                />
              ))}
            </div>
            <div className="mt-auto pt-4 border-t">
              {allComplete ? (
                <div className="rounded-card bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 dark:border-primary/30 p-6 text-center">
                  <div className="inline-flex items-center justify-center rounded-pill bg-primary/10 p-3 mb-3">
                    <PartyPopper className="size-6 text-primary" />
                  </div>
                  <p className="font-display text-section-heading font-bold text-foreground">
                    {t("perfectDay")}
                  </p>
                  <p className="text-body text-primary mt-1">
                    {t("allCompletedDesc", { count: totalCount })}
                  </p>
                </div>
              ) : (
                <p className="text-body text-center text-muted-foreground">
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
