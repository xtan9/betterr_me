import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-page-title tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-section-heading text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

interface PageHeaderSkeletonProps {
  hasSubtitle?: boolean;
  hasActions?: boolean;
}

export function PageHeaderSkeleton({
  hasSubtitle = false,
  hasActions = false,
}: PageHeaderSkeletonProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        {hasSubtitle && <Skeleton className="h-5 w-64" />}
      </div>
      {hasActions && <Skeleton className="h-9 w-32" />}
    </div>
  );
}
