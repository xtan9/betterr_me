"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Flame, Star } from "lucide-react";

interface StreakCounterProps {
  currentStreak: number;
  bestStreak: number;
  variant?: "default" | "compact";
}

function getStreakMessageKey(streak: number): string {
  if (streak === 0) return "messages.zero";
  if (streak < 3) return "messages.building";
  if (streak < 7) return "messages.almostWeek";
  if (streak < 14) return "messages.keepGoing";
  if (streak < 30) return "messages.incredible";
  if (streak < 100) return "messages.unstoppable";
  return "messages.legendary";
}

export const StreakCounter = memo(function StreakCounter({
  currentStreak,
  bestStreak,
  variant = "default",
}: StreakCounterProps) {
  const t = useTranslations("habits.streak");
  const isPersonalBest = currentStreak === bestStreak && currentStreak > 0;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1">
          {currentStreak >= 7 && <Flame className="size-3.5 text-orange-500" />}
          <span className="font-medium">{t("days", { count: currentStreak })}</span>
        </div>
        <span className="text-muted-foreground">|</span>
        <div className="flex items-center gap-1">
          <Star className="size-3.5 text-emerald-500" />
          <span className="font-medium">{t("days", { count: bestStreak })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("current")}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {currentStreak >= 7 && <Flame className="size-5 text-orange-500" />}
          <span className="text-2xl font-bold text-orange-500">
            {t("days", { count: currentStreak })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {t(getStreakMessageKey(currentStreak))}
        </p>
        {isPersonalBest && (
          <p className="text-xs font-medium text-emerald-500 mt-1">{t("personalBest")}</p>
        )}
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("best")}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <Star className="size-5 text-emerald-500" />
          <span className="text-2xl font-bold text-emerald-500">
            {t("days", { count: bestStreak })}
          </span>
        </div>
      </div>
    </div>
  );
});
