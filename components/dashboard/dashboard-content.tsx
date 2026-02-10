"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const DailySnapshot = dynamic(() => import("./daily-snapshot").then(m => ({ default: m.DailySnapshot })));
const HabitChecklist = dynamic(() => import("./habit-checklist").then(m => ({ default: m.HabitChecklist })));
const TasksToday = dynamic(() => import("./tasks-today").then(m => ({ default: m.TasksToday })));
import { MotivationMessage } from "./motivation-message";
import { WeeklyInsightCard, type WeeklyInsight } from "./weekly-insight-card";
import { ListChecks, Repeat, RefreshCw, Sparkles } from "lucide-react";
import { getLocalDateString } from "@/lib/utils";
import type { DashboardData } from "@/lib/db/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface DashboardContentProps {
  userName: string;
  initialData?: DashboardData;
}

function getWeekKey(weekStartDay: number): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = now.getDay();
  const daysToSubtract = (dayOfWeek - weekStartDay + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - daysToSubtract);
  return getLocalDateString(weekStart);
}

export function DashboardContent({ userName, initialData }: DashboardContentProps) {
  const t = useTranslations("dashboard");
  const router = useRouter();

  const today = getLocalDateString();

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    `/api/dashboard?date=${today}`,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnFocus: true,
      refreshInterval: 60000, // Refresh every minute
      keepPreviousData: true, // Prevent skeleton flash when date changes at midnight
    }
  );

  // Weekly insight — only fetch on the user's week start day
  const dayOfWeek = new Date().getDay();
  // Default to Monday (1) if no profile data yet; real check uses profile pref
  const weekStartDay = 1;
  const isWeekStartDay = dayOfWeek === weekStartDay;
  const weekKey = getWeekKey(weekStartDay);
  const dismissKey = `insight-dismissed-${weekKey}`;

  const [insightDismissed, setInsightDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(dismissKey) === "true";
  });

  const { data: insightsData } = useSWR<{ insights: WeeklyInsight[] }>(
    isWeekStartDay && !insightDismissed ? "/api/insights/weekly" : null,
    fetcher
  );

  const handleDismissInsight = useCallback(() => {
    setInsightDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(dismissKey, "true");
    }
  }, [dismissKey]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("greeting.morning");
    if (hour < 18) return t("greeting.afternoon");
    return t("greeting.evening");
  };

  const handleToggleHabit = async (habitId: string) => {
    try {
      await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      mutate(); // Revalidate dashboard data
    } catch (err) {
      console.error("Failed to toggle habit:", err);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      mutate(); // Revalidate dashboard data
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const handleCreateHabit = () => {
    router.push("/habits/new");
  };

  const handleTaskClick = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
  };

  const handleCreateTask = () => {
    router.push("/tasks/new");
  };

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-lg font-medium text-destructive">
          {t("error.title")}
        </p>
        <Button onClick={() => mutate()} variant="outline">
          <RefreshCw className="size-4 mr-2" />
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  // Empty state for new users (no habits and no tasks)
  if (
    !data ||
    (data.stats.total_habits === 0 && data.stats.total_tasks === 0)
  ) {
    return (
      <div className="space-y-8">
        {/* Greeting */}
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {getGreeting()}, {userName}! 👋
          </h1>
          <p className="text-muted-foreground">{t("welcome")}</p>
        </div>

        {/* Empty state card */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="size-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">{t("empty.title")}</h2>
              <p className="text-muted-foreground max-w-md">
                {t("empty.subtitle")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleCreateHabit} size="lg">
                <Repeat className="size-4 mr-2" />
                {t("empty.createHabit")}
              </Button>
              <Button onClick={handleCreateTask} size="lg" variant="outline">
                <ListChecks className="size-4 mr-2" />
                {t("empty.createTask")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get top streak habit for motivation message
  const topStreakHabit = data.habits.reduce<{
    name: string;
    current_streak: number;
    completed_today: boolean;
  } | null>((top, habit) => {
    if (!top || habit.current_streak > top.current_streak) {
      return {
        name: habit.name,
        current_streak: habit.current_streak,
        completed_today: habit.completed_today,
      };
    }
    return top;
  }, null);

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {getGreeting()}, {userName}! 👋
        </h1>
        <p className="text-muted-foreground">{t("welcome")}</p>
      </div>

      {/* Weekly Insight — show on week start day if not dismissed */}
      {insightsData?.insights && insightsData.insights.length > 0 && !insightDismissed && (
        <WeeklyInsightCard
          insights={insightsData.insights}
          onDismiss={handleDismissInsight}
        />
      )}

      {/* Motivation Message — only show when user has habits */}
      {data.stats.total_habits > 0 && (
        <MotivationMessage stats={data.stats} topStreakHabit={topStreakHabit} />
      )}

      {/* Daily Snapshot — only show when user has habits */}
      {data.stats.total_habits > 0 && (
        <DailySnapshot stats={data.stats} />
      )}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Habits Checklist */}
        <HabitChecklist
          habits={data.habits}
          onToggle={handleToggleHabit}
          onCreateHabit={handleCreateHabit}
        />

        {/* Tasks Today */}
        <TasksToday
          tasks={data.tasks_today}
          onToggle={handleToggleTask}
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />
      </div>
    </div>
  );
}

// Loading skeleton component (DASH-007)
function DashboardSkeleton() {
  return (
    <div className="space-y-8" data-testid="dashboard-skeleton">
      {/* Greeting skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-64" />
        <Skeleton className="h-5 w-full max-w-96" />
      </div>

      {/* Motivation skeleton */}
      <Skeleton className="h-16 w-full rounded-lg" />

      {/* Stats skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Content grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="p-6 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <div className="p-6 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
