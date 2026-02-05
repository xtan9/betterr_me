"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HabitForm } from "@/components/habits/habit-form";
import type { HabitFormValues } from "@/lib/validations/habit";

export function CreateHabitContent() {
  const router = useRouter();
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

      router.push("/habits");
    } catch (error) {
      console.error("Error creating habit:", error);
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
