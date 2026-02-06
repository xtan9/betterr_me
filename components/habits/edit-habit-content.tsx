"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HabitForm } from "@/components/habits/habit-form";
import type { Habit } from "@/lib/db/types";
import type { HabitFormValues } from "@/lib/validations/habit";

interface EditHabitContentProps {
  habitId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.habit;
};

function EditHabitSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="edit-habit-skeleton">
      <Skeleton className="h-8 w-32" />
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
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 flex-1" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  );
}

export function EditHabitContent({ habitId }: EditHabitContentProps) {
  const router = useRouter();
  const t = useTranslations("habits");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: habit, error, isLoading, mutate } = useSWR<Habit>(
    `/api/habits/${habitId}`,
    fetcher
  );

  const handleSubmit = async (data: HabitFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to update habit");
      }

      await mutate();
      toast.success(t("toast.updateSuccess"));
      router.back();
    } catch (error) {
      console.error("Update habit error:", error);
      toast.error(t("toast.updateError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return <EditHabitSkeleton />;
  }

  if (error || !habit) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">{t("error.title")}</h2>
        <Button onClick={() => mutate()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <HabitForm
        mode="edit"
        initialData={habit}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isSubmitting}
      />
    </div>
  );
}
