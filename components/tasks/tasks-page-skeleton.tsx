import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";

export function TasksPageSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="tasks-skeleton">
      <PageHeaderSkeleton hasActions />

      {/* Tabs skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
