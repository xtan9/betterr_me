"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditScopeDialog } from "@/components/tasks/edit-scope-dialog";
import { TaskDetailSkeleton } from "@/components/tasks/task-detail-skeleton";
import { TaskDetailsGrid } from "@/components/tasks/task-details-grid";
import { revalidateSidebarCounts } from "@/lib/hooks/use-sidebar-counts";
import { useCategories } from "@/lib/hooks/use-categories";
import { getProjectColor } from "@/lib/projects/colors";
import type { Task, RecurringTask } from "@/lib/db/types";
import type { EditScope } from "@/lib/validations/recurring-task";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";
import { fetcher } from "@/lib/fetcher";

interface TaskDetailContentProps {
  taskId: string;
}

const taskFetcher = async (url: string) => {
  const data = await fetcher(url);
  return data.task;
};

export function TaskDetailContent({ taskId }: TaskDetailContentProps) {
  const router = useRouter();
  const t = useTranslations("tasks");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { categories } = useCategories();
  const [isDeleting, setIsDeleting] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");

  const {
    data: task,
    error,
    isLoading,
    mutate,
  } = useSWR<Task>(`/api/tasks/${taskId}`, taskFetcher);

  // Fetch recurring task template if this is a recurring instance
  const { data: recurringTemplate } = useSWR<RecurringTask>(
    task?.recurring_task_id
      ? `/api/recurring-tasks/${task.recurring_task_id}`
      : null,
    async (url: string) => {
      const data = await fetcher(url);
      return data.recurring_task;
    },
  );

  const handleToggle = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to toggle");
      mutate();
      revalidateSidebarCounts();
    } catch (err) {
      console.error("Failed to toggle task:", err);
      toast.error(t("toast.toggleError"));
    }
  };

  const handleEditClick = () => {
    if (task?.recurring_task_id) {
      setScopeAction("edit");
      setScopeDialogOpen(true);
    } else {
      router.push(`/tasks/${taskId}/edit`);
    }
  };

  const handleDeleteClick = () => {
    if (task?.recurring_task_id) {
      setScopeAction("delete");
      setScopeDialogOpen(true);
    }
    // For non-recurring, the AlertDialog handles it
  };

  const handleScopeConfirm = async (scope: EditScope) => {
    if (scopeAction === "edit") {
      router.push(`/tasks/${taskId}/edit?scope=${scope}`);
    } else {
      setIsDeleting(true);
      try {
        const response = await fetch(`/api/tasks/${taskId}?scope=${scope}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to delete");
        revalidateSidebarCounts();
        toast.success(t("delete.success"));
        router.push("/tasks");
      } catch (err) {
        console.error("Failed to delete recurring task:", err);
        toast.error(t("delete.error"));
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      revalidateSidebarCounts();
      toast.success(t("delete.success"));
      router.push("/tasks");
    } catch (err) {
      console.error("Failed to delete task:", err);
      toast.error(t("delete.error"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <TaskDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-section-heading mb-2">{t("error.title")}</h2>
        <Button onClick={() => mutate()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-section-heading">{t("detail.notFound")}</h2>
      </div>
    );
  }

  const category = task.category_id
    ? categories.find((c) => c.id === task.category_id) ?? null
    : null;
  const catColor = category ? getProjectColor(category.color) : null;
  const catBgColor = catColor
    ? (isDark ? catColor.hslDark : catColor.hsl)
    : undefined;

  return (
    <div className="flex flex-col gap-section-gap">
      <div>
        <PageBreadcrumbs section="tasks" itemName={task.title} />
        <PageHeader
          title={task.title}
          actions={
            <Button onClick={handleEditClick} className="gap-2">
              <Edit className="size-4" />
              {t("detail.edit")}
            </Button>
          }
        />
      </div>

      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-card-padding">
          {/* Status */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="gap-1.5"
            >
              {task.is_completed ? (
                <>
                  <CheckCircle2 className="size-4 text-primary" />
                  <Badge variant="default" className="bg-primary">
                    {t("detail.completed")}
                  </Badge>
                </>
              ) : (
                <>
                  <Circle className="size-4 text-muted-foreground" />
                  <Badge variant="secondary">{t("detail.pending")}</Badge>
                </>
              )}
            </Button>
            {task.description && (
              <p className="text-muted-foreground mt-2">{task.description}</p>
            )}
          </div>

          {/* Recurrence info */}
          {task.recurring_task_id && recurringTemplate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Repeat className="size-4" />
              <span>
                {describeRecurrence(recurringTemplate.recurrence_rule, t)}
              </span>
            </div>
          )}

          {/* Reflection badge */}
          {task.completion_difficulty && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <span className="text-sm">
                {{ 1: "⚡", 2: "👌", 3: "💪" }[task.completion_difficulty]}
              </span>
              <span className="text-sm text-muted-foreground">
                {t(
                  `detail.reflection.${{ 1: "easy", 2: "good", 3: "hard" }[task.completion_difficulty]}`,
                )}
              </span>
            </div>
          )}

          {/* Details grid */}
          <TaskDetailsGrid task={task} category={category} catBgColor={catBgColor} />

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            {task.recurring_task_id ? (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={handleDeleteClick}
                disabled={isDeleting}
              >
                <Trash2 className="size-4" />
                {t("detail.delete")}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="size-4" />
                    {t("detail.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("detail.delete")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("detail.deleteConfirm")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t("detail.deleteCancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      <Trash2 className="size-4 mr-2" />
                      {t("detail.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Scope dialog for recurring tasks */}
          <EditScopeDialog
            open={scopeDialogOpen}
            onOpenChange={setScopeDialogOpen}
            onConfirm={handleScopeConfirm}
            action={scopeAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
