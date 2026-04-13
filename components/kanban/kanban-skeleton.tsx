import { Skeleton } from "@/components/ui/skeleton";

export function KanbanSkeleton() {
  const columns = ["Backlog", "To Do", "In Progress", "Done"];

  return (
    <div className="flex gap-4 p-6 overflow-x-auto">
      {columns.map((column) => (
        <div
          key={column}
          className="w-72 min-w-72 bg-muted/30 rounded-card p-3 space-y-3"
        >
          {/* Column header */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-8 rounded-pill" />
          </div>

          {/* Card placeholders */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-background rounded-card p-3 space-y-2 shadow-sm"
            >
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex items-center gap-2 pt-1">
                <Skeleton className="h-5 w-14 rounded-pill" />
                <Skeleton className="h-5 w-10 rounded-pill" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
