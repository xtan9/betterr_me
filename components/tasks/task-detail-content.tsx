"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Edit,
  Trash2,
  AlertCircle,
  Briefcase,
  User,
  ShoppingCart,
  MoreHorizontal,
  CheckCircle2,
  Circle,
  Calendar,
  Clock,
  Flag,
  Tag,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
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
import type { Task, TaskCategory, RecurringTask } from "@/lib/db/types";
import type { EditScope } from "@/lib/validations/recurring-task";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";

interface TaskDetailContentProps {
  taskId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.task;
};

const CATEGORY_ICONS: Record<TaskCategory, typeof Briefcase> = {
  work: Briefcase,
  personal: User,
  shopping: ShoppingCart,
  other: MoreHorizontal,
};

const CATEGORY_COLORS: Record<TaskCategory, string> = {
  work: "bg-blue-500",
  personal: "bg-purple-500",
  shopping: "bg-amber-500",
  other: "bg-slate-500",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "text-slate-400",
  1: "text-green-500",
  2: "text-yellow-500",
  3: "text-red-500",
};

function TaskDetailSkeleton() {
  return (
    <div className="space-y-6" data-testid="task-detail-skeleton">
      <div>
        <Skeleton className="h-4 w-32 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-6">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function TaskDetailContent({ taskId }: TaskDetailContentProps) {
  const router = useRouter();
  const t = useTranslations("tasks");
  const categoryT = useTranslations("tasks.categories");
  const priorityT = useTranslations("tasks.priorities");
  const [isDeleting, setIsDeleting] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit");

  const {
    data: task,
    error,
    isLoading,
    mutate,
  } = useSWR<Task>(`/api/tasks/${taskId}`, fetcher);

  // Fetch recurring task template if this is a recurring instance
  const { data: recurringTemplate } = useSWR<RecurringTask>(
    task?.recurring_task_id ? `/api/recurring-tasks/${task.recurring_task_id}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch recurring template: ${res.status}`);
      const data = await res.json();
      return data.recurring_task;
    }
  );

  const handleToggle = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to toggle");
      mutate();
    } catch {
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
        toast.success(t("delete.success"));
        router.push("/tasks");
      } catch {
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
      toast.success(t("delete.success"));
      router.push("/tasks");
    } catch {
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
        <h2 className="text-lg font-semibold mb-2">{t("error.title")}</h2>
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
        <h2 className="text-lg font-semibold">{t("detail.notFound")}</h2>
      </div>
    );
  }

  const CategoryIcon = task.category
    ? CATEGORY_ICONS[task.category]
    : MoreHorizontal;
  const categoryColor = task.category
    ? CATEGORY_COLORS[task.category]
    : "bg-slate-500";
  const priorityColor = PRIORITY_COLORS[task.priority] ?? "text-slate-400";

  return (
    <div className="space-y-6">
      <div>
        <PageBreadcrumbs section="tasks" itemName={task.title} />
        <PageHeader
          title={task.title}
          actions={
            <Button
              onClick={handleEditClick}
              className="gap-2"
            >
              <Edit className="size-4" />
              {t("detail.edit")}
            </Button>
          }
        />
      </div>

      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-6">
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

          {/* Your Why */}
          {task.intention && (
            <div className="flex items-start gap-3 p-4 rounded-lg border-l-4 border-l-primary bg-highlight">
              <div>
                <p className="text-sm font-medium text-primary">
                  {t("detail.yourWhy")}
                </p>
                <p className="text-sm text-muted-foreground mt-1 italic">
                  {task.intention}
                </p>
              </div>
            </div>
          )}

          {/* Recurrence info */}
          {task.recurring_task_id && recurringTemplate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Repeat className="size-4" />
              <span>{describeRecurrence(recurringTemplate.recurrence_rule)}</span>
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
          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Tag className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("detail.category")}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <CategoryIcon
                    className={cn("size-4 text-white rounded p-0.5", categoryColor)}
                  />
                  <span className="font-medium">
                    {task.category ? categoryT(task.category) : "---"}
                  </span>
                </div>
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Flag className={cn("size-5", priorityColor)} />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("detail.priority")}
                </p>
                <span className={cn("font-medium", priorityColor)}>
                  {priorityT(String(task.priority))}
                </span>
              </div>
            </div>

            {/* Due date */}
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Calendar className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("detail.dueDate")}
                </p>
                <span className="font-medium">
                  {task.due_date || t("detail.noDueDate")}
                </span>
              </div>
            </div>

            {/* Due time */}
            <div className="flex items-center gap-3 p-4 rounded-lg border">
              <Clock className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("detail.dueTime")}
                </p>
                <span className="font-medium">
                  {task.due_time ? task.due_time.slice(0, 5) : "---"}
                </span>
              </div>
            </div>
          </div>

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
                    <AlertDialogCancel>{t("detail.deleteCancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-white hover:bg-destructive/90"
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
