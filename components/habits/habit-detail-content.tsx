"use client";

import { useCallback, useMemo, useState } from "react";
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
  GraduationCap,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";
import { useTogglingSet } from "@/lib/hooks/use-toggling-set";
import { revalidateSidebarCounts } from "@/lib/hooks/use-sidebar-counts";
import { setHabitCompletion } from "@/lib/hooks/use-habit-toggle";
import { useCategories } from "@/lib/hooks/use-categories";
import { getProjectColor } from "@/lib/projects/colors";
import { getCategoryDisplayName } from "@/lib/categories/get-category-display-name";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/page-header";
import { HabitDetailSkeleton, formatFrequency } from "@/components/habits/habit-detail-skeleton";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { StreakCounter } from "@/components/habits/streak-counter";
import { NextMilestone } from "@/components/habits/next-milestone";
import { GraduateDialog } from "@/components/habits/graduate-dialog";
import { ReactivateDialog } from "@/components/habits/reactivate-dialog";
import dynamic from "next/dynamic";

const HabitCalendar = dynamic(() =>
  import("@/components/habits/heatmap").then((m) => ({
    default: m.HabitCalendar,
  })),
);
import { fetcher } from "@/lib/fetcher";
import type { Habit, HabitLog, Profile } from "@/lib/db/types";

interface HabitDetailContentProps {
  habitId: string;
}

interface HabitStats {
  thisWeek: { completed: number; total: number; percent: number };
  thisMonth: { completed: number; total: number; percent: number };
  allTime: { completed: number; total: number; percent: number };
}

const habitFetcher = async (url: string) => {
  const data = await fetcher(url);
  return data.habit || data;
};


export function HabitDetailContent({ habitId }: HabitDetailContentProps) {
  const router = useRouter();
  const t = useTranslations("habits");
  const tCat = useTranslations("categories");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { categories } = useCategories();

  const {
    data: habit,
    error: habitError,
    isLoading: habitLoading,
    mutate: mutateHabit,
  } = useSWR<Habit>(`/api/habits/${habitId}`, habitFetcher);

  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const handleMonthChange = useCallback((newYear: number, newMonth: number) => {
    setCalendarYear(newYear);
    setCalendarMonth(newMonth);
  }, []);

  const logsSwrKey = useMemo(() => {
    if (!habit) return null;
    const startDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const endDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return `/api/habits/${habitId}/logs?start_date=${startDate}&end_date=${endDate}`;
  }, [habit, habitId, calendarYear, calendarMonth]);

  const { data: logsData, mutate: mutateLogs } = useSWR<{ logs: HabitLog[] }>(
    logsSwrKey,
    fetcher,
    { keepPreviousData: true },
  );

  const { data: statsData } = useSWR<HabitStats>(
    habit ? `/api/habits/${habitId}/stats` : null,
    fetcher,
  );

  const { data: profileData } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher,
  );
  const weekStartDay = profileData?.profile?.preferences?.week_start_day ?? 0;

  const logs = useMemo(
    () => (Array.isArray(logsData?.logs) ? logsData.logs : []),
    [logsData],
  );

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

    const completed = !(
      logsData?.logs.find((log: HabitLog) => log.logged_date === date)?.completed ??
      false
    );
    startToggling(date);

    try {
      await mutateLogs(
        async () => {
          await setHabitCompletion(habitId, completed, date);
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
  }, [isToggling, logsData, startToggling, stopToggling, mutateLogs, habitId, mutateHabit, t]);

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

  const handleGraduate = async () => {
    try {
      const response = await fetch(`/api/habits/${habitId}/graduate`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to graduate");
      mutateHabit();
      revalidateSidebarCounts();
      toast.success(t("toast.graduateSuccess"));
      router.push("/habits");
    } catch (err) {
      log.error("[habits] graduate", err, { habitId });
      toast.error(t("toast.graduateError"));
    }
  };

  const handleReactivate = async () => {
    try {
      const response = await fetch(`/api/habits/${habitId}/reactivate`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to reactivate");
      mutateHabit();
      revalidateSidebarCounts();
      toast.success(t("toast.reactivateSuccess"));
    } catch (err) {
      log.error("[habits] reactivate", err, { habitId });
      toast.error(t("toast.reactivateError"));
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
        <h2 className="text-section-heading mb-2">{t("error.title")}</h2>
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
    <div className="flex flex-col gap-section-gap">
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
        <CardContent className="space-y-6 pt-card-padding">
          {/* Title metadata */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge
                variant={habit.status === "active" ? "default" : "secondary"}
                className={cn(
                  habit.status === "active" && "bg-primary",
                  habit.status === "paused" && "bg-status-warning",
                  habit.status === "formed" && "bg-primary"
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
                  <span>{getCategoryDisplayName(category.name, tCat)}</span>
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
            <h2 className="text-section-heading">{t("detail.completion.title")}</h2>
            <div className="space-y-3">
              {completionPeriods.map(({ key, label, percent }) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-24 text-body text-muted-foreground">
                    {label}
                  </span>
                  <Progress value={percent} className="flex-1" />
                  <span className="w-24 text-body text-right">
                    {t("detail.completion.percent", { percent })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Heatmap */}
          <HabitCalendar
            habitId={habitId}
            frequency={frequency ?? habit.frequency}
            logs={logs}
            onToggleDate={handleToggleDate}
            weekStartDay={weekStartDay}
            year={calendarYear}
            month={calendarMonth}
            onMonthChange={handleMonthChange}
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
            {habit.status === "active" && (
              <Button
                variant="outline"
                onClick={() => setGraduateOpen(true)}
                className="gap-2"
              >
                <GraduationCap className="size-4" />
                {t("detail.actions.graduate")}
              </Button>
            )}
            {habit.status === "formed" && (
              <Button
                variant="outline"
                onClick={() => setReactivateOpen(true)}
                className="gap-2"
              >
                <RotateCcw className="size-4" />
                {t("detail.actions.reactivate")}
              </Button>
            )}
            <Button variant="destructive" onClick={handleDelete} className="gap-2">
              <Trash2 className="size-4" />
              {t("detail.actions.delete")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <GraduateDialog
        open={graduateOpen}
        onOpenChange={setGraduateOpen}
        habitName={habit.name}
        onConfirm={handleGraduate}
      />
      <ReactivateDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        habitName={habit.name}
        bestStreak={habit.best_streak}
        onConfirm={handleReactivate}
      />
    </div>
  );
}
