"use client";

import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const MILESTONE_STREAKS = new Set([7, 14, 30, 60, 90, 180, 365]);

interface JournalStreakBadgeProps {
  streak: number;
}

export function JournalStreakBadge({ streak }: JournalStreakBadgeProps) {
  const t = useTranslations("dashboard.journal.streak");

  if (streak === 0) return null;

  const isMilestone = MILESTONE_STREAKS.has(streak);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        isMilestone
          ? "text-orange-500 font-semibold"
          : "text-muted-foreground",
      )}
      data-testid="journal-streak-badge"
    >
      <Flame
        className={cn("size-4", isMilestone && "animate-pulse")}
        aria-hidden="true"
      />
      {t("count", { count: streak })}
    </span>
  );
}
