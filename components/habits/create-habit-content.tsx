"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HabitForm } from "@/components/habits/habit-form";
import type { HabitFormValues } from "@/lib/validations/habit";

export function CreateHabitContent() {
  const router = useRouter();
  const t = useTranslations("habits");
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
        throw new Error("Failed to create habit");
      }

      toast.success(t("toast.createSuccess"));
      router.push("/habits");
    } catch (error) {
      toast.error(t("toast.createError"));
      throw error;
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
