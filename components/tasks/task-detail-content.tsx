"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { Task, TaskCategory } from "@/lib/db/types";

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
    <div className="max-w-3xl mx-auto space-y-6" data-testid="task-detail-skeleton">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

export function TaskDetailContent({ taskId }: TaskDetailContentProps) {
  const router = useRouter();
  const t = useTranslations("tasks");
  const categoryT = useTranslations("tasks.categories");
  const priorityT = useTranslations("tasks.priorities");
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: task, error, isLoading, mutate } = useSWR<Task>(
    `/api/tasks/${taskId}`,
    fetcher
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

  const CategoryIcon = task.category ? CATEGORY_ICONS[task.category] : MoreHorizontal;
  const categoryColor = task.category ? CATEGORY_COLORS[task.category] : "bg-slate-500";
  const priorityColor = PRIORITY_COLORS[task.priority] ?? "text-slate-400";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push("/tasks")}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          {t("detail.back")}
        </Button>
        <Button
          onClick={() => router.push(`/tasks/${taskId}/edit`)}
          className="gap-2"
        >
          <Edit className="size-4" />
          {t("detail.edit")}
        </Button>
      </div>

      {/* Title and status */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="gap-1.5"
          >
            {task.is_completed ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" />
                <Badge variant="default" className="bg-emerald-500">
                  {t("detail.completed")}
                </Badge>
              </>
            ) : (
              <>
                <Circle className="size-4 text-muted-foreground" />
                <Badge variant="secondary">
                  {t("detail.pending")}
                </Badge>
              </>
            )}
          </Button>
        </div>
        {task.description && (
          <p className="text-muted-foreground">{task.description}</p>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Category */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <Tag className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("detail.category")}</p>
            <div className="flex items-center gap-2 mt-1">
              <CategoryIcon className={cn("size-4 text-white rounded p-0.5", categoryColor)} />
              <span className="font-medium">
                {task.category ? categoryT(task.category) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Priority */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <Flag className={cn("size-5", priorityColor)} />
          <div>
            <p className="text-sm text-muted-foreground">{t("detail.priority")}</p>
            <span className={cn("font-medium", priorityColor)}>
              {priorityT(String(task.priority))}
            </span>
          </div>
        </div>

        {/* Due date */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <Calendar className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("detail.dueDate")}</p>
            <span className="font-medium">
              {task.due_date || t("detail.noDueDate")}
            </span>
          </div>
        </div>

        {/* Due time */}
        <div className="flex items-center gap-3 p-4 rounded-lg border">
          <Clock className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("detail.dueTime")}</p>
            <span className="font-medium">
              {task.due_time ? task.due_time.slice(0, 5) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
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
      </div>
    </div>
  );
}
