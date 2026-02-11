"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import type { HabitMilestone, Habit } from "@/lib/db/types";

interface MilestoneCardProps {
  milestone: HabitMilestone;
  habitName: string;
}

function getCelebrationKey(milestone: number): string | null {
  const thresholdKeys: Record<number, string> = {
    7: "celebration7",
    14: "celebration14",
    30: "celebration30",
    50: "celebration50",
    100: "celebration100",
    200: "celebration200",
    365: "celebration365",
  };
  return thresholdKeys[milestone] || null;
}

export function MilestoneCard({ milestone, habitName }: MilestoneCardProps) {
  const t = useTranslations("habits.milestone");

  const celebrationKey = getCelebrationKey(milestone.milestone);

  return (
    <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-950/30 dark:to-teal-950/30 dark:border-emerald-800">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-3">
          <Trophy className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-emerald-900 dark:text-emerald-100 truncate">
            {t("celebration", { habit: habitName, count: milestone.milestone })}
          </p>
          {celebrationKey && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {t(celebrationKey)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MilestoneCardsProps {
  milestones: HabitMilestone[];
  habits: Habit[];
}

export function MilestoneCards({ milestones, habits }: MilestoneCardsProps) {
  if (milestones.length === 0) return null;

  const habitMap = new Map(habits.map(h => [h.id, h]));
  const displayMilestones = milestones
    .filter(m => habitMap.has(m.habit_id))
    .slice(0, 2);

  if (displayMilestones.length === 0) return null;

  return (
    <div className="space-y-3">
      {displayMilestones.map(m => (
        <MilestoneCard
          key={m.id}
          milestone={m}
          habitName={habitMap.get(m.habit_id)!.name}
        />
      ))}
    </div>
  );
}
