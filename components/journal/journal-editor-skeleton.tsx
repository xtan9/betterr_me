export function JournalEditorSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-8 rounded-md bg-muted" />
        ))}
      </div>
      {/* Editor area skeleton */}
      <div className="min-h-[300px] rounded-md bg-muted" />
    </div>
  );
}
