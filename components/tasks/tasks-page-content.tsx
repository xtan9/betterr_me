"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskList } from "./task-list";
import type { Task } from "@/lib/db/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const data = await res.json();
  return data.tasks;
};

export function TasksPageContent() {
  const t = useTranslations("tasks");
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    "/api/tasks",
    fetcher,
    {
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  const handleToggleTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      mutate();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const handleTaskClick = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
  };

  const handleCreateTask = () => {
    router.push("/tasks/new");
  };

  if (isLoading) {
    return <TasksPageSkeleton />;
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
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("page.title")}
        </h1>
        <Button onClick={handleCreateTask}>
          <Plus className="size-4 mr-2" />
          {t("page.createButton")}
        </Button>
      </div>

      {/* Task List */}
      <TaskList
        tasks={data || []}
        onToggle={handleToggleTask}
        onTaskClick={handleTaskClick}
        onCreateTask={handleCreateTask}
      />
    </div>
  );
}

function TasksPageSkeleton() {
  return (
    <div className="space-y-6" data-testid="tasks-skeleton">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
