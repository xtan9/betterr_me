"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { TaskForm } from "@/components/tasks/task-form";
import type { RecurrenceConfig } from "@/components/tasks/task-form";
import type { TaskFormValues } from "@/lib/validations/task";
import { getLocalDateString } from "@/lib/utils";

export function CreateTaskContent() {
  const router = useRouter();
  const t = useTranslations("tasks");
  const tBreadcrumb = useTranslations("tasks.breadcrumb");
  const tForm = useTranslations("tasks.form");
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: TaskFormValues, recurrence?: RecurrenceConfig) => {
    setIsLoading(true);
    try {
      if (recurrence?.rule) {
        // Create a recurring task template
        const response = await fetch("/api/recurring-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            description: data.description || null,
            intention: data.intention || null,
            priority: data.priority ?? 0,
            category: data.category || null,
            due_time: data.due_time ? `${data.due_time}:00` : null,
            recurrence_rule: recurrence.rule,
            start_date: data.due_date || getLocalDateString(),
            end_type: recurrence.endType,
            end_date: recurrence.endDate || null,
            end_count: recurrence.endCount || null,
            date: getLocalDateString(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to create recurring task");
        }
      } else {
        // Create a regular task
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            description: data.description || null,
            due_time: data.due_time ? `${data.due_time}:00` : null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to create task");
        }
      }

      mutate("/api/dashboard");
      mutate(
        (key: string) =>
          typeof key === "string" && key.startsWith("/api/tasks"),
        undefined,
      );

      toast.success(t("toast.createSuccess"));
      router.push("/tasks");
    } catch (error) {
      console.error("Create task error:", error);
      toast.error(t("toast.createError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="space-y-6">
      <div>
        <PageBreadcrumbs section="tasks" itemName={tBreadcrumb("newTask")} />
        <PageHeader
          title={tForm("createTitle")}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                {tForm("cancel")}
              </Button>
              <Button
                type="submit"
                form="task-form"
                disabled={isLoading}
              >
                {isLoading ? tForm("creating") : tForm("create")}
              </Button>
            </>
          }
        />
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <TaskForm
            id="task-form"
            mode="create"
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isLoading}
            hideChrome
          />
        </CardContent>
      </Card>
    </div>
  );
}
