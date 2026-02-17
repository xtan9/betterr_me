"use client";

import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Target, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  iconBgClass: string;
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
    label: string;
  };
}

function StatCard({ icon, iconBgClass, title, value, subtitle, trend }: StatCardProps) {
  return (
    <Card data-testid="stat-card" className="min-w-0 gap-0 py-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-full p-2.5 shrink-0", iconBgClass)} aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-stat mt-0.5">{value}</p>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 text-sm mt-1",
                  trend.isPositive ? "text-primary" : "text-red-500"
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
        </div>
      </CardContent>
    </Card>
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
      <h2 className="font-display text-section-heading">{t("title")}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-card-gap">
        <StatCard
          icon={<Target className="size-4 text-blue-600 dark:text-blue-400" />}
          iconBgClass="bg-blue-100 dark:bg-blue-900/30"
          title={t("activeHabits")}
          value={stats.total_habits}
        />
        <StatCard
          icon={<Target className="size-4 text-primary" />}
          iconBgClass="bg-primary/10"
          title={t("todaysProgress")}
          value={`${stats.completed_today}/${stats.total_habits}`}
          subtitle={t("completionRate", { percent: completionRate })}
          trend={trend}
        />
        <StatCard
          icon={<Flame className="size-4 text-orange-600 dark:text-orange-400" />}
          iconBgClass="bg-orange-100 dark:bg-orange-900/30"
          title={t("currentStreak")}
          value={t("days", { count: stats.current_best_streak })}
        />
      </div>
    </div>
  );
}
