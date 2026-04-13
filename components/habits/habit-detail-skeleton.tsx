import type { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";
import type { Habit } from "@/lib/db/types";

export function HabitDetailSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="habit-detail-skeleton">
      {/* Breadcrumb + Header skeleton */}
      <div>
        <Skeleton className="h-4 w-40 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      {/* Card-wrapped content skeleton */}
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-card-padding">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {/* Streak skeleton */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          {/* Stats skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          {/* Heatmap skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="size-8 rounded-md" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function formatFrequency(
  frequency: Habit["frequency"],
  t: ReturnType<typeof useTranslations>,
): string {
  switch (frequency.type) {
    case "daily":
      return t("frequency.daily");
    case "weekdays":
      return t("frequency.weekdays");
    case "weekly":
      return t("frequency.weekly");
    case "times_per_week":
      return t("frequency.timesPerWeek", { count: frequency.count });
    case "custom":
      return t("frequency.custom");
    default:
      return "";
  }
}
