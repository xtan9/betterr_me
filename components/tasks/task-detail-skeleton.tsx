"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";

export function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="task-detail-skeleton">
      <div>
        <Skeleton className="h-4 w-32 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-card-padding">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
