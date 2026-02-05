"use client";

import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Target, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
    label: string;
  };
}

function StatCard({ icon, title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="min-w-[120px] rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      {subtitle && (
        <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>
      )}
      {trend && (
        <div
          className={cn(
            "flex items-center gap-1 text-sm mt-1",
            trend.isPositive ? "text-emerald-500" : "text-red-500"
          )}
        >
          {trend.isPositive ? (
            <TrendingUp className="size-4" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-4" aria-hidden="true" />
          )}
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  );
}

interface DailySnapshotProps {
  stats: {
    total_habits: number;
    completed_today: number;
    current_best_streak: number;
    tasks_due_today: number;
    tasks_completed_today: number;
  };
  yesterdayStats?: {
    habits_completed: number;
    habits_total: number;
  } | null;
}

export function DailySnapshot({ stats, yesterdayStats }: DailySnapshotProps) {
  const t = useTranslations("dashboard.snapshot");

  // Calculate completion rate
  const completionRate =
    stats.total_habits > 0
      ? Math.round((stats.completed_today / stats.total_habits) * 100)
      : 0;

  // Calculate trend vs yesterday
  let trend: { value: number; isPositive: boolean; label: string } | undefined;
  if (yesterdayStats && yesterdayStats.habits_total > 0) {
    const yesterdayRate = Math.round(
      (yesterdayStats.habits_completed / yesterdayStats.habits_total) * 100
    );
    const change = completionRate - yesterdayRate;
    if (change !== 0) {
      trend = {
        value: Math.abs(change),
        isPositive: change > 0,
        label: t("vsYesterday", { change: Math.abs(change) }),
      };
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Target className="size-4" aria-hidden="true" />}
          title={t("activeHabits")}
          value={stats.total_habits}
        />
        <StatCard
          icon={<Target className="size-4" aria-hidden="true" />}
          title={t("todaysProgress")}
          value={`${stats.completed_today}/${stats.total_habits}`}
          subtitle={t("completionRate", { percent: completionRate })}
          trend={trend}
        />
        <StatCard
          icon={<Flame className="size-4" aria-hidden="true" />}
          title={t("currentStreak")}
          value={t("days", { count: stats.current_best_streak })}
        />
      </div>
    </div>
  );
}
