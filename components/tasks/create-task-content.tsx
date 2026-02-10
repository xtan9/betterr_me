"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { TaskForm } from "@/components/tasks/task-form";
import type { TaskFormValues } from "@/lib/validations/task";

export function CreateTaskContent() {
  const router = useRouter();
  const t = useTranslations("tasks");
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: TaskFormValues) => {
    setIsLoading(true);
    try {
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
    <div className="max-w-2xl mx-auto">
      <TaskForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
