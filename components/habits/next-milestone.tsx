"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { getNextMilestone, getDaysToNextMilestone } from "@/lib/habits/milestones";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";

interface NextMilestoneProps {
  currentStreak: number;
}

export const NextMilestone = memo(function NextMilestone({ currentStreak }: NextMilestoneProps) {
  const t = useTranslations("habits.milestone");

  const nextMilestone = getNextMilestone(currentStreak);
  const daysRemaining = getDaysToNextMilestone(currentStreak);

  if (!nextMilestone || daysRemaining === null) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
        <Target className="size-5 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm text-muted-foreground">{t("noNextMilestone")}</p>
      </div>
    );
  }

  const progress = Math.max(0, Math.round((currentStreak / nextMilestone) * 100));

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-3">
        <Target className="size-5 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium">
          {t("nextMilestone", { days: daysRemaining, milestone: nextMilestone })}
        </p>
      </div>
      <Progress value={progress} className="h-2" aria-label={t("nextMilestone", { days: daysRemaining, milestone: nextMilestone })} />
    </div>
  );
});
