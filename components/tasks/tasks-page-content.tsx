"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";
import { TaskList } from "./task-list";
import type { Task, RecurringTask } from "@/lib/db/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const data = await res.json();
  return data.tasks;
};

const recurringFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.recurring_tasks;
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

  const {
    data: pausedTemplates,
    error: pausedError,
    mutate: mutatePaused,
  } = useSWR<RecurringTask[]>(
    "/api/recurring-tasks?status=paused",
    recurringFetcher,
    { revalidateOnFocus: true }
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

  const handleResume = async (templateId: string) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${templateId}?action=resume`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      mutatePaused();
      mutate(); // refresh tasks list — resumed template may generate new instances
      toast.success(t("paused.resumeSuccess"));
    } catch (err) {
      console.error("Failed to resume recurring task:", templateId, err);
      toast.error(t("paused.actionError"));
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${templateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      mutatePaused();
      toast.success(t("paused.deleteSuccess"));
    } catch (err) {
      console.error("Failed to delete recurring task:", templateId, err);
      toast.error(t("paused.actionError"));
    }
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
      <PageHeader
        title={t("page.title")}
        actions={
          <Button onClick={handleCreateTask}>
            <Plus className="size-4 mr-2" />
            {t("page.createButton")}
          </Button>
        }
      />

      {/* Task List */}
      <TaskList
        tasks={data || []}
        onToggle={handleToggleTask}
        onTaskClick={handleTaskClick}
        onCreateTask={handleCreateTask}
      />

      {/* Paused recurring tasks load error */}
      {pausedError && (
        <p className="text-sm text-destructive">
          {t("paused.loadError")}{" "}
          <button
            onClick={() => mutatePaused()}
            className="underline hover:no-underline"
          >
            {t("error.retry")}
          </button>
        </p>
      )}

      {/* Paused recurring tasks banner */}
      {pausedTemplates && pausedTemplates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Pause className="size-4" />
            {t("paused.title", { count: pausedTemplates.length })}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pausedTemplates.map((template) => (
              <Card key={template.id} className="border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium truncate text-sm">{template.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {describeRecurrence(template.recurrence_rule)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleResume(template.id)}
                        title={t("paused.resume")}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteTemplate(template.id)}
                        title={t("paused.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TasksPageSkeleton() {
  return (
    <div className="space-y-6" data-testid="tasks-skeleton">
      <PageHeaderSkeleton hasActions />

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
