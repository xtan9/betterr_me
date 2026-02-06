"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { HabitForm } from "@/components/habits/habit-form";
import type { HabitFormValues } from "@/lib/validations/habit";

export function CreateHabitContent() {
  const router = useRouter();
  const t = useTranslations("habits");
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: HabitFormValues) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to create habit");
      }

      // Revalidate caches so dashboard and habits list show the new habit
      mutate("/api/dashboard");
      mutate("/api/habits");

      toast.success(t("toast.createSuccess"));
      router.push("/habits");
    } catch (error) {
      console.error("Create habit error:", error);
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
      <HabitForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
