"use client";

import { useTranslations } from "next-intl";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HabitMilestone, Habit } from "@/lib/db/types";

interface MilestoneCardProps {
  milestone: HabitMilestone;
  habitName: string;
  onDismiss?: (milestoneId: string) => void;
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

export function MilestoneCard({ milestone, habitName, onDismiss }: MilestoneCardProps) {
  const t = useTranslations("habits.milestone");

  const celebrationKey = getCelebrationKey(milestone.milestone);

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 dark:border-primary/30">
      <Trophy className="size-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {t("celebration", { habit: habitName, count: milestone.milestone })}
        </p>
        {celebrationKey && (
          <p className="text-sm text-primary">
            {t(celebrationKey)}
          </p>
        )}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(milestone.id)}
          className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          aria-label={t("dismiss")}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface MilestoneCardsProps {
  milestones: HabitMilestone[];
  habits: Habit[];
  onDismiss?: (milestoneId: string) => void;
}

export function MilestoneCards({ milestones, habits, onDismiss }: MilestoneCardsProps) {
  if (milestones.length === 0) return null;

  const habitMap = new Map(habits.map(h => [h.id, h]));
  const displayMilestones = milestones
    .filter(m => habitMap.has(m.habit_id))
    .slice(0, 2);

  if (displayMilestones.length === 0) return null;

  return (
    <div className="space-y-3">
      {displayMilestones.map(m => {
        const habit = habitMap.get(m.habit_id);
        if (!habit) return null;
        return (
          <MilestoneCard
            key={m.id}
            milestone={m}
            habitName={habit.name}
            onDismiss={onDismiss}
          />
        );
      })}
    </div>
  );
}
