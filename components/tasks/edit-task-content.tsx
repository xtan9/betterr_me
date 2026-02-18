"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { TaskForm } from "@/components/tasks/task-form";
import type { TaskFormValues } from "@/lib/validations/task";
import type { Task } from "@/lib/db/types";

interface EditTaskContentProps {
  taskId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.task;
};

function EditTaskSkeleton() {
  return (
    <div className="space-y-6" data-testid="edit-task-skeleton">
      <div>
        <Skeleton className="h-4 w-32 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 flex-1" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function EditTaskContent({ taskId }: EditTaskContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") as "this" | "following" | "all" | null;
  const t = useTranslations("tasks");
  const tForm = useTranslations("tasks.form");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: task, error, isLoading, mutate } = useSWR<Task>(
    `/api/tasks/${taskId}`,
    fetcher
  );

  const handleSubmit = async (data: TaskFormValues) => {
    setIsSubmitting(true);
    try {
      const url = scope
        ? `/api/tasks/${taskId}?scope=${scope}`
        : `/api/tasks/${taskId}`;

      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          description: data.description || null,
          due_time: data.due_time ? `${data.due_time}:00` : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to update task");
      }

      await mutate();
      toast.success(t("edit.success"));
      router.back();
    } catch (error) {
      console.error("Update task error:", error);
      toast.error(t("edit.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return <EditTaskSkeleton />;
  }

  if (error || !task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">{t("error.title")}</h2>
        <Button onClick={() => mutate()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <PageBreadcrumbs section="tasks" itemName={task.title} />
        <PageHeader
          title={tForm("editTitle")}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                {tForm("cancel")}
              </Button>
              <Button
                type="submit"
                form="task-form"
                disabled={isSubmitting}
              >
                {isSubmitting ? tForm("saving") : tForm("save")}
              </Button>
            </>
          }
        />
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <TaskForm
            id="task-form"
            mode="edit"
            initialData={task}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isSubmitting}
            hideChrome
            showRecurrence={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
