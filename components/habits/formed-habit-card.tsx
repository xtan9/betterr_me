"use client";

import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import type { Habit } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  habit: Habit;
  onReactivate: (habitId: string) => void;
  onDelete: (habitId: string) => void;
}

export function FormedHabitCard({ habit, onReactivate, onDelete }: Props) {
  const t = useTranslations("habits");

  const graduatedDate = habit.graduated_at
    ? new Date(habit.graduated_at).toLocaleDateString()
    : "";

  const totalDaysActive =
    habit.graduated_at && habit.created_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(habit.graduated_at).getTime() -
              new Date(habit.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-5 text-status-warning" aria-hidden="true" />
          {habit.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-body">
        {habit.graduated_at && (
          <div className="text-muted-foreground">
            {t("formed_gallery.graduated_on")}: {graduatedDate}
          </div>
        )}
        <div>
          {t("formed_gallery.at_streak", { n: habit.graduated_streak ?? 0 })}
        </div>
        <div className="text-muted-foreground">
          {t("formed_gallery.total_days_active", { n: totalDaysActive })}
        </div>
        <div className="text-muted-foreground">
          {t("formed_gallery.best_streak", { n: habit.best_streak })}
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={() => onReactivate(habit.id)}>
            {t("formed_gallery.reactivate")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(habit.id)}>
            {t("formed_gallery.delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
