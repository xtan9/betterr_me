"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Edit,
  AlertCircle,
  Tag,
  Pause,
  Play,
  Archive,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTogglingSet } from "@/lib/hooks/use-toggling-set";
import { revalidateSidebarCounts } from "@/lib/hooks/use-sidebar-counts";
import { useCategories } from "@/lib/hooks/use-categories";
import { getProjectColor } from "@/lib/projects/colors";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { StreakCounter } from "@/components/habits/streak-counter";
import { NextMilestone } from "@/components/habits/next-milestone";
import dynamic from "next/dynamic";

const Heatmap30Day = dynamic(() =>
  import("@/components/habits/heatmap").then((m) => ({
    default: m.Heatmap30Day,
  })),
);
import type { Habit, HabitLog } from "@/lib/db/types";

interface HabitDetailContentProps {
  habitId: string;
}

interface HabitStats {
  thisWeek: { completed: number; total: number; percent: number };
  thisMonth: { completed: number; total: number; percent: number };
  allTime: { completed: number; total: number; percent: number };
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.habit || data.logs || data;
};

function HabitDetailSkeleton() {
  return (
    <div className="space-y-6" data-testid="habit-detail-skeleton">
      {/* Breadcrumb + Header skeleton */}
      <div>
        <Skeleton className="h-4 w-40 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      {/* Card-wrapped content skeleton */}
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-6">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {/* Streak skeleton */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          {/* Stats skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          {/* Heatmap skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="size-8 rounded-md" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatFrequency(
  frequency: Habit["frequency"],
  t: ReturnType<typeof useTranslations>,
): string {
  switch (frequency.type) {
    case "daily":
      return t("frequency.daily");
    case "weekdays":
      return t("frequency.weekdays");
    case "weekly":
      return t("frequency.weekly");
    case "times_per_week":
      return t("frequency.timesPerWeek", { count: frequency.count });
    case "custom":
      return t("frequency.custom");
    default:
      return "";
  }
}

export function HabitDetailContent({ habitId }: HabitDetailContentProps) {
  const router = useRouter();
  const t = useTranslations("habits");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { categories } = useCategories();

  const {
    data: habit,
    error: habitError,
    isLoading: habitLoading,
    mutate: mutateHabit,
  } = useSWR<Habit>(`/api/habits/${habitId}`, fetcher);

  const { data: logsData, mutate: mutateLogs } = useSWR<{ logs: HabitLog[] }>(
    habit ? `/api/habits/${habitId}/logs?days=30` : null,
    fetcher,
  );

  const { data: statsData } = useSWR<HabitStats>(
    habit ? `/api/habits/${habitId}/stats` : null,
    fetcher,
  );

  const logs = useMemo(() => {
    const raw = logsData?.logs || logsData;
    return Array.isArray(raw) ? raw : [];
  }, [logsData]);

  const frequencyKey = habit ? JSON.stringify(habit.frequency) : "";
  const frequency = useMemo(() => habit?.frequency, [frequencyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(
    () =>
      statsData || {
        thisWeek: { completed: 0, total: 0, percent: 0 },
        thisMonth: { completed: 0, total: 0, percent: 0 },
        allTime: { completed: 0, total: 0, percent: 0 },
      },
    [statsData],
  );

  const completionPeriods = useMemo(
    () => [
      { key: "thisWeek", label: t("detail.completion.thisWeek"), percent: stats.thisWeek.percent },
      { key: "thisMonth", label: t("detail.completion.thisMonth"), percent: stats.thisMonth.percent },
      { key: "allTime", label: t("detail.completion.allTime"), percent: stats.allTime.percent },
    ],
    [t, stats],
  );

  const { isToggling, startToggling, stopToggling } = useTogglingSet();

  const handleToggleDate = useCallback(async (date: string) => {
    if (isToggling(date)) return;

    startToggling(date);

    try {
      await mutateLogs(
        async () => {
          const response = await fetch(`/api/habits/${habitId}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date }),
          });
          if (!response.ok) {
            throw new Error(`Failed to toggle: ${response.status}`);
          }
          return undefined;
        },
        {
          optimisticData: (current: { logs: HabitLog[] } | undefined) => {
            if (!current) return { logs: [] };
            const logsList = current.logs || [];
            const existingLog = logsList.find(
              (l: HabitLog) => l.logged_date === date,
            );
            let updatedLogs: HabitLog[];
            if (existingLog) {
              updatedLogs = logsList.map((l: HabitLog) =>
                l.logged_date === date ? { ...l, completed: !l.completed } : l,
              );
            } else {
              const now = new Date().toISOString();
              updatedLogs = [
                ...logsList,
                {
                  id: `optimistic-${date}`,
                  habit_id: habitId,
                  user_id: "optimistic",
                  logged_date: date,
                  completed: true,
                  created_at: now,
                  updated_at: now,
                },
              ];
            }
            return { logs: updatedLogs };
          },
          populateCache: false,
          rollbackOnError: true,
          revalidate: false,
        },
      );
      mutateHabit();
      revalidateSidebarCounts();
    } catch (err) {
      console.error("Failed to toggle habit date:", err);
      toast.error(t("toast.updateError"));
    } finally {
      stopToggling(date);
    }
  }, [isToggling, startToggling, stopToggling, mutateLogs, habitId, mutateHabit, t]);

  const handlePause = async () => {
    if (!habit) return;
    const isPausing = habit.status !== "paused";
    try {
      const response = await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: isPausing ? "paused" : "active",
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      mutateHabit();
      revalidateSidebarCounts();
      toast.success(
        isPausing ? t("toast.pauseSuccess") : t("toast.resumeSuccess"),
      );
    } catch (err) {
      console.error("Failed to update habit status:", err);
      toast.error(isPausing ? t("toast.pauseError") : t("toast.resumeError"));
    }
  };

  const handleArchive = async () => {
    const confirmed = window.confirm(t("detail.confirmArchive"));
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/habits/${habitId}?archive=true`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to archive");
      revalidateSidebarCounts();
      toast.success(t("toast.archiveSuccess"));
      router.push("/habits");
    } catch (err) {
      console.error("Failed to archive habit:", err);
      toast.error(t("toast.archiveError"));
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(t("detail.confirmDelete"));
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/habits/${habitId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      revalidateSidebarCounts();
      toast.success(t("toast.deleteSuccess"));
      router.push("/habits");
    } catch (err) {
      console.error("Failed to delete habit:", err);
      toast.error(t("toast.deleteError"));
    }
  };

  if (habitLoading) {
    return <HabitDetailSkeleton />;
  }

  if (habitError || !habit) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">{t("error.title")}</h2>
        <Button onClick={() => mutateHabit()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  const category = habit.category_id
    ? categories.find((c) => c.id === habit.category_id) ?? null
    : null;
  const catColor = category ? getProjectColor(category.color) : null;
  const catBgColor = catColor
    ? (isDark ? catColor.hslDark : catColor.hsl)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs + Header */}
      <div>
        <PageBreadcrumbs section="habits" itemName={habit.name} />
        <PageHeader
          title={habit.name}
          actions={
            <Button onClick={() => router.push(`/habits/${habitId}/edit`)} className="gap-2">
              <Edit className="size-4" />
              {t("detail.edit")}
            </Button>
          }
        />
      </div>

      {/* All content wrapped in Card */}
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-6">
          {/* Title metadata */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge
                variant={habit.status === "active" ? "default" : "secondary"}
                className={cn(
                  habit.status === "active" && "bg-primary",
                  habit.status === "paused" && "bg-status-warning",
                  habit.status === "archived" && "bg-muted-foreground"
                )}
              >
                {t(`detail.status.${habit.status}`)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              {category && (
                <>
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded p-0.5",
                      !catBgColor && "bg-muted"
                    )}
                    style={catBgColor ? { backgroundColor: catBgColor } : undefined}
                  >
                    <Tag className="size-4 text-white" aria-hidden="true" />
                  </span>
                  <span>{category.name}</span>
                  <span>•</span>
                </>
              )}
              <span>{formatFrequency(habit.frequency, t)}</span>
            </div>
            {habit.description && (
              <p className="text-muted-foreground">{habit.description}</p>
            )}
          </div>

          {/* Streak Counter */}
          <StreakCounter
            currentStreak={habit.current_streak}
            bestStreak={habit.best_streak}
          />

          {/* Next Milestone */}
          <NextMilestone currentStreak={habit.current_streak} />

          {/* Completion Stats */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("detail.completion.title")}</h2>
            <div className="space-y-3">
              {completionPeriods.map(({ key, label, percent }) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-24 text-sm text-muted-foreground">
                    {label}
                  </span>
                  <Progress value={percent} className="flex-1" />
                  <span className="w-24 text-sm text-right">
                    {t("detail.completion.percent", { percent })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Heatmap */}
          <Heatmap30Day
            habitId={habitId}
            frequency={frequency ?? habit.frequency}
            logs={logs}
            onToggleDate={handleToggleDate}
          />

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handlePause} className="gap-2">
              {habit.status === "paused" ? (
                <>
                  <Play className="size-4" />
                  {t("detail.actions.resume")}
                </>
              ) : (
                <>
                  <Pause className="size-4" />
                  {t("detail.actions.pause")}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleArchive} className="gap-2">
              <Archive className="size-4" />
              {t("detail.actions.archive")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="gap-2">
              <Trash2 className="size-4" />
              {t("detail.actions.delete")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
