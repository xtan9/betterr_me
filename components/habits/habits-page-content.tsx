"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HabitList } from "./habit-list";
import type { HabitWithTodayStatus } from "@/lib/db/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch habits");
  const data = await res.json();
  return data.habits;
};

export function HabitsPageContent() {
  const t = useTranslations("habits");
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<HabitWithTodayStatus[]>(
    "/api/habits?with_today=true",
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );

  const handleToggleHabit = async (habitId: string) => {
    try {
      await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().split("T")[0] }),
      });
      mutate();
    } catch (err) {
      console.error("Failed to toggle habit:", err);
    }
  };

  const handleHabitClick = (habitId: string) => {
    router.push(`/habits/${habitId}`);
  };

  const handleCreateHabit = () => {
    router.push("/habits/new");
  };

  if (isLoading) {
    return <HabitsPageSkeleton />;
  }

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t("page.title")}</h1>
        <Button onClick={handleCreateHabit}>
          <Plus className="size-4 mr-2" />
          {t("page.createButton")}
        </Button>
      </div>

      {/* Habit List */}
      <HabitList
        habits={data || []}
        onToggle={handleToggleHabit}
        onHabitClick={handleHabitClick}
      />
    </div>
  );
}

function HabitsPageSkeleton() {
  return (
    <div className="space-y-6" data-testid="habits-skeleton">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
