import { Skeleton } from "@/components/ui/skeleton";

export default function ControlPlaneLoading() {
  return <div className="mx-auto max-w-content space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><div className="flex justify-between"><div className="space-y-2"><Skeleton className="h-8 w-44" /><Skeleton className="h-5 w-64" /></div><Skeleton className="h-10 w-28" /></div><Skeleton className="h-40 w-full" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((lane) => <div className="rounded-card border bg-muted/30 p-3" key={lane}><Skeleton className="h-6 w-28" /><div className="mt-4 space-y-4">{[0, 1].map((card) => <Skeleton className="h-24 w-full" key={card} />)}</div></div>)}</div></div>;
}
