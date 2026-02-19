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
import { HabitForm } from "@/components/habits/habit-form";
import { revalidateSidebarCounts } from "@/lib/hooks/use-sidebar-counts";
import type { HabitFormValues } from "@/lib/validations/habit";

export function CreateHabitContent() {
  const router = useRouter();
  const t = useTranslations("habits");
  const tBreadcrumb = useTranslations("habits.breadcrumb");
  const tForm = useTranslations("habits.form");
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
      mutate("/api/habits?with_today=true");
      revalidateSidebarCounts();

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
    <div className="space-y-6">
      <div>
        <PageBreadcrumbs section="habits" itemName={tBreadcrumb("newHabit")} />
        <PageHeader
          title={tForm("createTitle")}
          actions={
            <>
              <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
                {tForm("cancel")}
              </Button>
              <Button type="submit" form="habit-form" disabled={isLoading}>
                {isLoading ? tForm("creating") : tForm("create")}
              </Button>
            </>
          }
        />
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <HabitForm
            id="habit-form"
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
