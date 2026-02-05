"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Edit,
  AlertCircle,
  Heart,
  Brain,
  BookOpen,
  Zap,
  MoreHorizontal,
  Pause,
  Play,
  Archive,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StreakCounter } from "@/components/habits/streak-counter";
import { Heatmap30Day } from "@/components/habits/heatmap";
import type { Habit, HabitLog, HabitCategory } from "@/lib/db/types";

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

const CATEGORY_ICONS: Record<HabitCategory, typeof Heart> = {
  health: Heart,
  wellness: Brain,
  learning: BookOpen,
  productivity: Zap,
  other: MoreHorizontal,
};

const CATEGORY_COLORS: Record<HabitCategory, string> = {
  health: "bg-rose-500",
  wellness: "bg-purple-500",
  learning: "bg-blue-500",
  productivity: "bg-amber-500",
  other: "bg-slate-500",
};

function HabitDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="habit-detail-skeleton">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
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
    </div>
  );
}

function formatFrequency(frequency: Habit["frequency"], t: ReturnType<typeof useTranslations>): string {
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

  const { data: habit, error: habitError, isLoading: habitLoading, mutate: mutateHabit } = useSWR<Habit>(
    `/api/habits/${habitId}`,
    fetcher
  );

  const { data: logsData, mutate: mutateLogs } = useSWR<{ logs: HabitLog[] }>(
    habit ? `/api/habits/${habitId}/logs?days=30` : null,
    fetcher
  );

  const { data: statsData } = useSWR<HabitStats>(
    habit ? `/api/habits/${habitId}/stats` : null,
    fetcher
  );

  const logs = logsData?.logs || logsData || [];
  const stats = statsData || {
    thisWeek: { completed: 0, total: 0, percent: 0 },
    thisMonth: { completed: 0, total: 0, percent: 0 },
    allTime: { completed: 0, total: 0, percent: 0 },
  };

  const handleToggleDate = async (date: string) => {
    try {
      await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      mutateLogs();
      mutateHabit();
    } catch (error) {
      console.error("Failed to toggle habit:", error);
    }
  };

  const handlePause = async () => {
    if (!habit) return;
    try {
      await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: habit.status === "paused" ? "active" : "paused",
        }),
      });
      mutateHabit();
    } catch (error) {
      console.error("Failed to update habit status:", error);
    }
  };

  const handleArchive = async () => {
    const confirmed = window.confirm(t("detail.confirmArchive"));
    if (!confirmed) return;
    try {
      await fetch(`/api/habits/${habitId}?archive=true`, {
        method: "DELETE",
      });
      router.push("/habits");
    } catch (error) {
      console.error("Failed to archive habit:", error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(t("detail.confirmDelete"));
    if (!confirmed) return;
    try {
      await fetch(`/api/habits/${habitId}`, {
        method: "DELETE",
      });
      router.push("/habits");
    } catch (error) {
      console.error("Failed to delete habit:", error);
    }
  };

  if (habitLoading) {
    return <HabitDetailSkeleton />;
  }

  if (habitError || !habit) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">{t("error.title")}</h2>
        <Button onClick={() => mutateHabit()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  const CategoryIcon = habit.category ? CATEGORY_ICONS[habit.category] : MoreHorizontal;
  const categoryColor = habit.category ? CATEGORY_COLORS[habit.category] : "bg-slate-500";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push("/habits")}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          {t("detail.backToHabits")}
        </Button>
        <Button onClick={() => router.push(`/habits/${habitId}/edit`)} className="gap-2">
          <Edit className="size-4" />
          {t("detail.edit")}
        </Button>
      </div>

      {/* Title and metadata */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{habit.name}</h1>
          <Badge
            variant={habit.status === "active" ? "default" : "secondary"}
            className={cn(
              habit.status === "active" && "bg-emerald-500",
              habit.status === "paused" && "bg-amber-500",
              habit.status === "archived" && "bg-slate-500"
            )}
          >
            {t(`detail.status.${habit.status}`)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <CategoryIcon className={cn("size-4 text-white rounded p-0.5", categoryColor)} />
          <span>{habit.category ? t(`categories.${habit.category}`) : ""}</span>
          <span>•</span>
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

      {/* Completion Stats */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("detail.completion.title")}</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="w-24 text-sm text-muted-foreground">
              {t("detail.completion.thisWeek")}
            </span>
            <Progress value={stats.thisWeek.percent} className="flex-1" />
            <span className="w-24 text-sm text-right">
              {t("detail.completion.percent", { percent: stats.thisWeek.percent })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-24 text-sm text-muted-foreground">
              {t("detail.completion.thisMonth")}
            </span>
            <Progress value={stats.thisMonth.percent} className="flex-1" />
            <span className="w-24 text-sm text-right">
              {t("detail.completion.percent", { percent: stats.thisMonth.percent })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-24 text-sm text-muted-foreground">
              {t("detail.completion.allTime")}
            </span>
            <Progress value={stats.allTime.percent} className="flex-1" />
            <span className="w-24 text-sm text-right">
              {t("detail.completion.percent", { percent: stats.allTime.percent })}
            </span>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <Heatmap30Day
        habitId={habitId}
        frequency={habit.frequency}
        logs={Array.isArray(logs) ? logs : []}
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
    </div>
  );
}
